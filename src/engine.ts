import { LightNode, LightRemovalNode, CHUNK_SIZE, MAX_LIGHT_LEVEL, WorldBlock, ExternalWorld, TestWorld, ChunkPosition, GeneralChunk, TEST_BLOCKS } from './externalWorld';
import { WorldLightHolder } from './worldLightHolder';

// Direction constants matching Minecraft's Direction enum
enum Direction {
    DOWN = 0,
    UP = 1,
    NORTH = 2,
    SOUTH = 3,
    WEST = 4,
    EAST = 5
}

// Queue entry flags and helpers - similar to Minecraft's QueueEntry system
class QueueEntry {
    static readonly LEVEL_MASK = 0xF;  // 15 in binary: 1111
    static readonly DIRECTIONS_MASK = 0x3F0;  // 1008 in binary: 1111110000
    static readonly FLAG_FROM_EMPTY_SHAPE = 0x400;  // 1024 in binary
    static readonly FLAG_INCREASE_FROM_EMISSION = 0x800;  // 2048 in binary

    static decreaseAllDirections(level: number): number {
        return this.withLevel(this.DIRECTIONS_MASK, level);
    }

    static decreaseSkipOneDirection(level: number, dir: Direction): number {
        const withoutDir = this.withoutDirection(this.DIRECTIONS_MASK, dir);
        return this.withLevel(withoutDir, level);
    }

    static increaseSkipOneDirection(level: number, fromEmptyShape: boolean, dir: Direction): number {
        let entry = this.withoutDirection(this.DIRECTIONS_MASK, dir);
        if (fromEmptyShape) {
            entry |= this.FLAG_FROM_EMPTY_SHAPE;
        }
        return this.withLevel(entry, level);
    }

    static increaseOnlyOneDirection(level: number, fromEmptyShape: boolean, dir: Direction): number {
        let entry = 0;
        if (fromEmptyShape) {
            entry |= this.FLAG_FROM_EMPTY_SHAPE;
        }
        entry = this.withDirection(entry, dir);
        return this.withLevel(entry, level);
    }

    static getFromLevel(entry: number): number {
        return entry & this.LEVEL_MASK;
    }

    static isFromEmptyShape(entry: number): boolean {
        return (entry & this.FLAG_FROM_EMPTY_SHAPE) !== 0;
    }

    static shouldPropagateInDirection(entry: number, dir: Direction): boolean {
        return (entry & (1 << (dir + 4))) !== 0;
    }

    static withLevel(entry: number, level: number): number {
        return (entry & ~this.LEVEL_MASK) | (level & this.LEVEL_MASK);
    }

    static withDirection(entry: number, dir: Direction): number {
        return entry | (1 << (dir + 4));
    }

    static withoutDirection(entry: number, dir: Direction): number {
        return entry & ~(1 << (dir + 4));
    }

    static increaseSkySourceInDirections(
        down: boolean,
        north: boolean,
        south: boolean,
        west: boolean,
        east: boolean
    ): number {
        let entry = this.withLevel(0, LightWorld.MAX_LEVEL);

        if (down) {
            entry = this.withDirection(entry, Direction.DOWN);
        }
        if (north) {
            entry = this.withDirection(entry, Direction.NORTH);
        }
        if (south) {
            entry = this.withDirection(entry, Direction.SOUTH);
        }
        if (west) {
            entry = this.withDirection(entry, Direction.WEST);
        }
        if (east) {
            entry = this.withDirection(entry, Direction.EAST);
        }

        return entry;
    }
}

export class LightWorld {
    public PARALLEL_CHUNK_PROCESSING = true

    // not necessarily needed for the engine to work, but useful for side cases
    public worldLightHolder: WorldLightHolder

    private sunLightQueue: [number, number, number][] = []; // [pos, queueEntry, localX, localY, localZ, chunk]
    private blockLightQueue: LightNode[] = [];
    private lightRemovalQueue: LightRemovalNode[] = [];
    private sunLightDecreaseQueue: [number, number][] = []; // [pos, queueEntry]
    private sunLightIncreaseQueue: [number, number][] = []; // [pos, queueEntry]

    private pendingLightUpdates: Map<string, {
        terminate(): void;
        column: ChunkPosition;
        priority: number;
        timestamp: number;
    }> = new Map();
    private isProcessingLight = false;
    public performanceStats: Map<string, { calls: number, totalTime: number }> = new Map();
    private affectedChunksTimestamps: Map<string, number> = new Map();
    public onChunkProcessed = [] as ((chunkX: number, chunkZ: number) => void)[];
    chunksProcessed = 0

    // Minecraft's light system constants
    public static readonly MAX_LEVEL = 15;
    private static readonly MIN_OPACITY = 1;
    private static readonly DIRECTIONS = [
        { x: 0, y: -1, z: 0 },  // DOWN
        { x: 0, y: 1, z: 0 },   // UP
        { x: 0, y: 0, z: -1 },  // NORTH
        { x: 0, y: 0, z: 1 },   // SOUTH
        { x: -1, y: 0, z: 0 },  // WEST
        { x: 1, y: 0, z: 0 }    // EAST
    ];

    constructor(public externalWorld: ExternalWorld = new TestWorld()) {
        this.worldLightHolder = new WorldLightHolder(this.WORLD_HEIGHT, this.WORLD_MIN_Y)
    }

    get WORLD_HEIGHT() {
        return this.externalWorld.WORLD_HEIGHT;
    }

    get WORLD_MIN_Y() {
        return this.externalWorld.WORLD_MIN_Y;
    }

    hasChunk(x: number, z: number): boolean {
        return this.externalWorld.hasChunk?.(x, z) ?? this.externalWorld.getChunk(x, z) !== undefined;
    }

    getBlockLight(x: number, y: number, z: number): number {
        return this.externalWorld.getBlockLight(x, y, z);
    }

    setBlockChunkAffected(x: number, y: number, z: number): void {
        const { chunk } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return;

        const key = this.getChunkKey(chunk.position.x, chunk.position.z);
        this.affectedChunksTimestamps.set(key, performance.now());
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        this.setBlockChunkAffected(x, y, z);
        this.externalWorld.setBlockLight(x, y, z, value);
    }

    getSunLight(x: number, y: number, z: number): number {
        return this.externalWorld.getSunLight(x, y, z);
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
        this.setBlockChunkAffected(x, y, z);
        this.externalWorld.setSunLight(x, y, z, value);
    }

    // Convert between coordinate systems (global position to block position)
    private encodeBlockPos(x: number, y: number, z: number): number {
        // Simple encoding to fit x, y, z into a number (approximation of Minecraft's BlockPos.asLong)
        // Limited by JavaScript Number precision, but works for demonstration
        return (x & 0xFFFFF) | ((y & 0xFFF) << 20) | ((z & 0xFFFFF) << 32);
    }

    private decodeBlockPos(pos: number): [number, number, number] {
        const x = pos & 0xFFFFF;
        const y = (pos >> 20) & 0xFFF;
        const z = (pos >> 32) & 0xFFFFF;
        return [x, y, z];
    }

    getHighestBlockInColumn(chunk: GeneralChunk, x: number, z: number): number {
        const highestBlockInColumn = this.externalWorld.getHighestBlockInColumn?.(chunk, x, z);
        if (highestBlockInColumn !== undefined) {
            return highestBlockInColumn;
        }

        for (let y = this.WORLD_HEIGHT - 1; y >= this.WORLD_MIN_Y; y--) {
            const block = chunk.getBlock(x, y, z);
            if (block && block.id !== TEST_BLOCKS.air.id) {
                return y;
            }
        }

        return this.WORLD_MIN_Y;
    }

    private getChunkKey(x: number, z: number): string {
        return `${x},${z}`;
    }

    private markStart(name: string) {
        performance.mark(`${name}-start`);
    }

    private markEnd(name: string) {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);

        if (typeof performance !== 'undefined') {
            // Browser-specific code
            const measure = performance.getEntriesByName(name).pop();
            if (measure) {
                const stats = this.performanceStats.get(name) || { calls: 0, totalTime: 0 };
                stats.calls++;
                stats.totalTime += measure.duration;
                this.performanceStats.set(name, stats);
            }
        }

        // Cleanup
        performance.clearMarks(`${name}-start`);
        performance.clearMarks(`${name}-end`);
        performance.clearMeasures(name);
    }

    getPerformanceStats(): string {
        const lines: string[] = ['Performance Statistics:'];
        for (const [name, stats] of this.performanceStats.entries()) {
            lines.push(`${name}:
  Calls: ${stats.calls}
  Total Time: ${stats.totalTime.toFixed(2)}ms
  Average Time: ${(stats.totalTime / stats.calls).toFixed(2)}ms`);
        }
        return lines.join('\n');
    }

    getBlock(x: number, y: number, z: number): WorldBlock | undefined {
        return this.externalWorld.getBlock(x, y, z);
    }

    setBlock(x: number, y: number, z: number, block: WorldBlock, autoPropagate = true): void {
        const oldBlock = this.getBlock(x, y, z);
        const oldBlockLight = this.getBlockLight(x, y, z);
        const oldSunLight = this.getSunLight(x, y, z);

        // If the old block had any light, we need to remove it first
        if (oldBlockLight > 0) {
            this.removeBlockLight(x, y, z);
        }
        if (oldSunLight > 0) {
            this.removeSunLight(x, y, z);
        }

        // Set the new block
        this.externalWorld.setBlock(x, y, z, block.id);

        // If the new block is a light source, add its light
        if (block.isLightSource) {
            this.setBlockLight(x, y, z, block.lightEmission);
            const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
            if (chunk) {
                this.blockLightQueue.push({
                    x: localX,
                    y,
                    z: localZ,
                    chunk
                });
            }
        }

        // Handle block change for skylight
        this.checkSkyLightForBlock(x, y, z);

        if (autoPropagate) {
            // Propagate light changes if needed
            if (this.lightRemovalQueue.length > 0) {
                this.unPropagateLight();
            }
            if (this.blockLightQueue.length > 0) {
                this.propagateBlockLight();
            }
            this.propagateSkyLightUpdates();
        }
    }

    private getChunkAndLocalCoord(
        globalX: number,
        y: number,
        globalZ: number
    ): { chunk: GeneralChunk | undefined; localX: number; localZ: number } {
        const chunkX = Math.floor(globalX / CHUNK_SIZE);
        const chunkZ = Math.floor(globalZ / CHUNK_SIZE);

        const localX = ((globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((globalZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        const chunk = this.externalWorld.getChunk(chunkX, chunkZ);
        return { chunk, localX, localZ };
    }

    private removeBlockLight(x: number, y: number, z: number, lightLevel = this.getBlockLight(x, y, z)): void {
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return;

        // Add to removal queue with original light level
        this.lightRemovalQueue.push({
            x: localX,
            y,
            z: localZ,
            value: lightLevel,
            chunk
        });

        // Set the light to 0
        this.setBlockLight(x, y, z, 0);
    }

    private removeSunLight(x: number, y: number, z: number): void {
        const lightLevel = this.getSunLight(x, y, z);
        if (lightLevel === 0) return;

        // Set the light to 0 immediately
        this.setSunLight(x, y, z, 0);

        // Add to the decrease queue with the appropriate entry
        const pos = this.encodeBlockPos(x, y, z);
        const queueEntry = QueueEntry.decreaseAllDirections(lightLevel);
        this.sunLightDecreaseQueue.push([pos, queueEntry]);
    }

    private unPropagateLight(): void {
        while (this.lightRemovalQueue.length > 0) {
            const node = this.lightRemovalQueue.shift()!;
            const { x, y, z, value: lightLevel, chunk } = node;

            for (const dir of LightWorld.DIRECTIONS) {
                const globalX = chunk.position.x * CHUNK_SIZE + x + dir.x;
                const newY = y + dir.y;
                const globalZ = chunk.position.z * CHUNK_SIZE + z + dir.z;

                // Skip if Y is out of bounds
                if (newY < this.WORLD_MIN_Y || newY >= this.WORLD_HEIGHT) {
                    continue;
                }

                const { chunk: targetChunk, localX: targetX, localZ: targetZ } =
                    this.getChunkAndLocalCoord(globalX, newY, globalZ);

                // Check if target chunk exists
                if (!targetChunk) continue;

                const neighborLight = targetChunk.getBlockLight(targetX, newY, targetZ);

                // If the neighbor's light is coming from the removed light source
                if (neighborLight !== 0 && neighborLight < lightLevel) {
                    this.removeBlockLight(globalX, newY, globalZ, neighborLight);
                }
                // If the neighbor has equal or greater light level, it might be from another source
                else if (neighborLight >= lightLevel) {
                    this.blockLightQueue.push({
                        x: targetX,
                        y: newY,
                        z: targetZ,
                        chunk: targetChunk
                    });
                }
            }
        }
    }

    private checkSkyLightForBlock(x: number, y: number, z: number): void {
        if (!this.externalWorld.SUPPORTS_SKY_LIGHT) return;

        const blockPos = this.encodeBlockPos(x, y, z);
        const block = this.getBlock(x, y, z);

        // Get the lowest source Y (highest opaque block) in this column
        // This is a simplified version of getLowestSourceY in Minecraft
        let lowestSourceY = this.WORLD_HEIGHT;
        for (let cy = this.WORLD_HEIGHT - 1; cy >= this.WORLD_MIN_Y; cy--) {
            const blockAtY = this.getBlock(x, cy, z);
            if (blockAtY?.isOpaque) {
                lowestSourceY = cy + 1; // The block above the opaque block
                break;
            }
        }

        // Similar to checkNode in SkyLightEngine
        const isAboveLowestSource = y >= lowestSourceY;

        if (isAboveLowestSource) {
            // Similar to the case in checkNode where y >= lowestSourceY
            // Block is above the lowest source, it should get full skylight
            if (block?.isOpaque) {
                // If it's opaque, first remove any existing light
                this.removeSunLight(x, y, z);
            } else {
                // Otherwise it should get full skylight
                const pos = this.encodeBlockPos(x, y, z);
                const currentLight = this.getSunLight(x, y, z);

                // Only add if it's not already at full brightness
                if (currentLight < LightWorld.MAX_LEVEL) {
                    this.setSunLight(x, y, z, LightWorld.MAX_LEVEL);
                    const queueEntry = QueueEntry.increaseSkipOneDirection(LightWorld.MAX_LEVEL, true, Direction.UP);
                    this.sunLightIncreaseQueue.push([pos, queueEntry]);
                }
            }
        } else {
            // Block is below the lowest source, it should be dark
            // unless it's getting light from the sides
            const currentLight = this.getSunLight(x, y, z);
            if (currentLight > 0) {
                this.removeSunLight(x, y, z);
            }

            // Pull in any light from neighbors (similar to PULL_LIGHT_IN_ENTRY)
            const pos = this.encodeBlockPos(x, y, z);
            const queueEntry = QueueEntry.decreaseAllDirections(1);
            this.sunLightDecreaseQueue.push([pos, queueEntry]);
        }

        // This is similar to updateSourcesInColumn in SkyLightEngine
        // Update light sources in the column when a block changes
        this.updateSkyLightSourcesInColumn(x, z, lowestSourceY);
    }

    private updateSkyLightSourcesInColumn(x: number, z: number, lowestSourceY: number): void {
        // This is a simplified implementation of updateSourcesInColumn

        // First remove sources below the new lowest source
        this.removeSourcesBelow(x, z, lowestSourceY);

        // Then add sources above the new lowest source
        this.addSourcesAbove(x, z, lowestSourceY);
    }

    private removeSourcesBelow(x: number, z: number, lowestSourceY: number): void {
        // Skip if lowestSourceY is at the bottom
        if (lowestSourceY <= this.WORLD_MIN_Y) return;

        // Remove light sources below the lowest source
        for (let y = lowestSourceY - 1; y >= this.WORLD_MIN_Y; y--) {
            const currentLight = this.getSunLight(x, y, z);

            // If it's already dark, we can stop
            if (currentLight === 0) break;

            // If it's a source level (15), remove it
            if (currentLight === LightWorld.MAX_LEVEL) {
                this.setSunLight(x, y, z, 0);

                // Add to the decrease queue
                const pos = this.encodeBlockPos(x, y, z);
                const queueEntry = y === lowestSourceY - 1
                    ? QueueEntry.decreaseAllDirections(LightWorld.MAX_LEVEL)  // REMOVE_TOP_SKY_SOURCE_ENTRY
                    : QueueEntry.decreaseSkipOneDirection(LightWorld.MAX_LEVEL, Direction.UP);  // REMOVE_SKY_SOURCE_ENTRY

                this.sunLightDecreaseQueue.push([pos, queueEntry]);
            }
        }
    }

    private addSourcesAbove(x: number, z: number, lowestSourceY: number): void {
        // Add light sources above the lowest source
        for (let y = lowestSourceY; y < this.WORLD_HEIGHT; y++) {
            const currentLight = this.getSunLight(x, y, z);

            // If it's already at max light, we can stop
            if (currentLight === LightWorld.MAX_LEVEL) break;

            // Set full sky light
            this.setSunLight(x, y, z, LightWorld.MAX_LEVEL);

            // Add to the increase queue for horizontal propagation
            if (y === lowestSourceY) { // Special case for the lowest source
                const pos = this.encodeBlockPos(x, y, z);
                const queueEntry = QueueEntry.increaseSkipOneDirection(LightWorld.MAX_LEVEL, true, Direction.UP);
                this.sunLightIncreaseQueue.push([pos, queueEntry]);
            }
        }
    }

    private propagateSkyLightUpdates(): void {
        this.markStart('propagateSkyLightUpdates');

        // First process the decrease queue
        this.propagateSkyLightDecreases();

        // Then process the increase queue
        this.propagateSkyLightIncreases();

        this.markEnd('propagateSkyLightUpdates');
    }

    private propagateSkyLightDecreases(): void {
        while (this.sunLightDecreaseQueue.length > 0) {
            const [pos, queueEntry] = this.sunLightDecreaseQueue.shift()!;
            const [x, y, z] = this.decodeBlockPos(pos);

            const fromLevel = QueueEntry.getFromLevel(queueEntry);

            // Process each direction that should propagate
            for (let dirIndex = 0; dirIndex < 6; dirIndex++) {
                if (!QueueEntry.shouldPropagateInDirection(queueEntry, dirIndex)) continue;

                const dir = LightWorld.DIRECTIONS[dirIndex];
                if (!dir) continue; // Skip if direction is undefined

                const nx = x + dir.x;
                const ny = y + dir.y;
                const nz = z + dir.z;

                // Skip if out of bounds
                if (ny < this.WORLD_MIN_Y || ny >= this.WORLD_HEIGHT) continue;

                // Get the neighboring light value
                const neighborLight = this.getSunLight(nx, ny, nz);

                // Skip if it's already dark
                if (neighborLight === 0) continue;

                // If the neighbor's light is dependent on this position
                if (neighborLight <= fromLevel - 1) {
                    // Reset it to 0 and propagate the decrease
                    this.setSunLight(nx, ny, nz, 0);

                    // Add to the decrease queue
                    const neighborPos = this.encodeBlockPos(nx, ny, nz);
                    const neighborEntry = QueueEntry.decreaseSkipOneDirection(neighborLight, 5 - dirIndex); // opposite direction
                    this.sunLightDecreaseQueue.push([neighborPos, neighborEntry]);
                } else {
                    // This neighbor might be a light source or getting light from somewhere else
                    // Add it to the increase queue to propagate its light
                    const neighborPos = this.encodeBlockPos(nx, ny, nz);
                    const neighborEntry = QueueEntry.increaseOnlyOneDirection(neighborLight, false, 5 - dirIndex); // opposite direction
                    this.sunLightIncreaseQueue.push([neighborPos, neighborEntry]);
                }
            }
        }
    }

    private propagateSkyLightIncreases(): void {
        while (this.sunLightIncreaseQueue.length > 0) {
            const [pos, queueEntry] = this.sunLightIncreaseQueue.shift()!;
            const [x, y, z] = this.decodeBlockPos(pos);

            // Get the current light level
            const currentLight = this.getSunLight(x, y, z);
            const fromLevel = QueueEntry.getFromLevel(queueEntry);

            // Only propagate if the stored level matches what we expect
            if (currentLight != fromLevel) continue;

            // Check each direction for propagation
            for (let dirIndex = 0; dirIndex < 6; dirIndex++) {
                if (!QueueEntry.shouldPropagateInDirection(queueEntry, dirIndex)) continue;

                const dir = LightWorld.DIRECTIONS[dirIndex];
                if (!dir) continue; // Skip if direction is undefined

                const nx = x + dir.x;
                const ny = y + dir.y;
                const nz = z + dir.z;

                // Skip if out of bounds
                if (ny < this.WORLD_MIN_Y || ny >= this.WORLD_HEIGHT) continue;

                // Check chunk borders - we might need to access a different chunk
                const { chunk: targetChunk, localX: targetX, localZ: targetZ } =
                    this.getChunkAndLocalCoord(nx, ny, nz);

                // If the target chunk doesn't exist, we can't propagate further in this direction
                if (!targetChunk) {
                    this.addPendingLight(nx, ny, nz, { x, y, z, dirIndex, level: currentLight });
                    continue;
                }

                // Get the neighbor's light level
                const neighborLight = this.getSunLight(nx, ny, nz);

                // Get the block state and calculate new light level
                const block = this.getBlock(nx, ny, nz);

                // Skip if the block is opaque (and not a light source)
                if (block?.isOpaque) continue;

                // Calculate opacity reduction - this is simplified compared to Minecraft
                let newLevel = currentLight - LightWorld.MIN_OPACITY;
                if (block?.filterLight) {
                    newLevel -= block.filterLight;
                }

                // Special case for downward propagation in skylight
                if (dirIndex === Direction.DOWN && !block?.isOpaque) {
                    newLevel = Math.max(newLevel, currentLight - 1);
                }

                // Skip if the new level wouldn't be brighter
                if (newLevel <= 0 || newLevel <= neighborLight) continue;

                // Set the new light level
                this.setSunLight(nx, ny, nz, newLevel);

                // Add to the queue for further propagation
                const neighborPos = this.encodeBlockPos(nx, ny, nz);
                const neighborEntry = QueueEntry.increaseSkipOneDirection(
                    newLevel,
                    !block?.isOpaque,
                    5 - dirIndex as Direction // opposite direction
                );
                this.sunLightIncreaseQueue.push([neighborPos, neighborEntry]);
            }
        }
    }

    public propagateBlockLight(): void {
        this.markStart('propagateLight');
        this.propagateGeneric(
            this.blockLightQueue,
            (chunk: GeneralChunk, x: number, y: number, z: number) => chunk.getBlockLight(x, y, z),
            (chunk: GeneralChunk, x: number, y: number, z: number, value: number) => chunk.setBlockLight(x, y, z, value),
            this.filterLight
        );
        this.markEnd('propagateLight');
    }

    private propagateGeneric(
        queue: LightNode[],
        getLightFn: (chunk: GeneralChunk, x: number, y: number, z: number) => number,
        setLightFn: (chunk: GeneralChunk, x: number, y: number, z: number, value: number) => void,
        filterFn: (block: WorldBlock | undefined, level: number) => number
    ): void {
        const processed = new Set<string>();

        while (queue.length > 0) {
            const node = queue.shift()!;
            const { x, y, z, chunk } = node;

            // Skip if already processed this position
            const nodeKey = `${chunk.position.x},${chunk.position.z},${x},${y},${z}`;
            if (processed.has(nodeKey)) {
                continue;
            }
            processed.add(nodeKey);

            const block = chunk.getBlock(x, y, z);
            const lightLevel = getLightFn(chunk, x, y, z);

            // Skip if this is an opaque block (unless it's a light source)
            if (block?.isOpaque && !block.isLightSource) {
                continue;
            }

            for (const dir of LightWorld.DIRECTIONS) {
                const globalX = chunk.position.x * CHUNK_SIZE + x + dir.x;
                const newY = y + dir.y;
                const globalZ = chunk.position.z * CHUNK_SIZE + z + dir.z;

                // Skip if Y is out of bounds
                if (newY < this.WORLD_MIN_Y || newY >= this.WORLD_HEIGHT) {
                    continue;
                }

                const { chunk: targetChunk, localX: targetX, localZ: targetZ } =
                    this.getChunkAndLocalCoord(globalX, newY, globalZ);

                // Check if target chunk exists
                if (!targetChunk) {
                    // Store this propagation for when the chunk loads
                    const dirIndex = LightWorld.DIRECTIONS.findIndex(d => d.x === dir.x && d.y === dir.y && d.z === dir.z);
                    this.addPendingLight(globalX, newY, globalZ, {
                        x: chunk.position.x * CHUNK_SIZE + x,
                        y,
                        z: chunk.position.z * CHUNK_SIZE + z,
                        dirIndex,
                        level: lightLevel
                    });
                    continue;
                }

                const targetBlock = targetChunk.getBlock(targetX, newY, targetZ);
                const currentLight = getLightFn(targetChunk, targetX, newY, targetZ);
                const newLight = filterFn(targetBlock, lightLevel);

                if (newLight === 0) continue;

                // Only propagate if:
                // 1. Target block can accept light (not opaque)
                // 2. New light level would be higher than current
                if ((!targetBlock?.isOpaque) && currentLight < newLight) {
                    setLightFn(targetChunk, targetX, newY, targetZ, newLight);
                    queue.push({
                        x: targetX,
                        y: newY,
                        z: targetZ,
                        chunk: targetChunk
                    });
                }
            }
        }
    }

    async receiveUpdateColumn(x: number, z: number): Promise<ChunkPosition[] | null> {
        this.affectedChunksTimestamps.clear();
        const chunk = this.externalWorld.getChunk(x, z)!;
        if (!chunk) {
            throw new Error(`Chunk ${x},${z} not loaded yet`);
        }

        // Set start time for this light operation
        const currentLightOperationStart = Date.now();

        // Add update to Map with timestamp
        const key = this.getChunkKey(x, z);
        const update = {
            column: { x, z },
            priority: 1,
            timestamp: Date.now(),
            terminate: () => {}
        };
        const currentUpdate = this.pendingLightUpdates.get(key);
        if (currentUpdate) {
            currentUpdate.terminate();
        }
        this.pendingLightUpdates.set(key, update);

        if (!this.isProcessingLight) {
            const promise = this.processLightQueue();
            if (!this.PARALLEL_CHUNK_PROCESSING) {
                await promise;
            }
        }

        const res = await new Promise<boolean>(resolve => {
            update.terminate = () => {
                resolve(false);
            }
            const checkComplete = () => {
                if (!this.pendingLightUpdates.has(key)) {
                    resolve(true);
                } else {
                    setTimeout(checkComplete, 10);
                }
            };
            checkComplete();
        })
        if (!res) return null;

        // Get affected chunks that were modified after operation start
        const affectedChunks = Array.from(this.affectedChunksTimestamps.entries())
            .filter(([_, timestamp]) => timestamp >= currentLightOperationStart)
            .map(([key]) => {
                const [chunkX, chunkZ] = key.split(',').map(Number) as [number, number];
                return { x: chunkX, z: chunkZ };
            });

        for (const chunk of affectedChunks) {
            this.onChunkProcessed.forEach(fn => fn(chunk.x, chunk.z));
        }

        return affectedChunks;
    }

    private async processLightQueue(): Promise<void> {
        this.markStart('processLightQueue');
        this.isProcessingLight = true;

        try {
            // Convert Map to array and sort by priority/timestamp if needed
            const updates = Array.from(this.pendingLightUpdates.entries());

            for (const [key, update] of updates) {
                // Check if this update has been superseded
                const currentUpdate = this.pendingLightUpdates.get(key);
                if (!currentUpdate || currentUpdate.timestamp !== update.timestamp) {
                    // Skip this update as a newer one exists
                    continue;
                }

                const { column } = update;
                const chunk = this.externalWorld.getChunk(column.x, column.z);
                if (!chunk) continue;

                // Process each type of light separately for clarity
                await this.processTorchlightForChunk(chunk);   // First process block light
                await this.processSunlightForChunk(chunk);     // Then process sky light

                // Remove this update only if it hasn't been superseded
                if (this.pendingLightUpdates.get(key)?.timestamp === update.timestamp) {
                    this.pendingLightUpdates.delete(key);
                }

                await new Promise(resolve => setTimeout(resolve, 0));
                this.chunksProcessed++
            }
        } finally {
            this.isProcessingLight = false;
            this.markEnd('processLightQueue');
        }
    }

    private async processTorchlightForChunk(chunk: GeneralChunk): Promise<void> {
        this.markStart('processTorchlightForChunk');

        // Scan the chunk for light-emitting blocks
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = this.WORLD_MIN_Y; y < this.WORLD_HEIGHT; y++) {
                    const block = chunk.getBlock(x, y, z);

                    // Process only torch/block light
                    if (block?.isLightSource) {
                        const globalX = chunk.position.x * CHUNK_SIZE + x;
                        const globalZ = chunk.position.z * CHUNK_SIZE + z;
                        this.setBlockLight(globalX, y, globalZ, block.lightEmission);

                        this.blockLightQueue.push({
                            x,
                            y,
                            z,
                            chunk
                        });
                    }
                }
            }
        }

        // Propagate torch light
        await this.propagateBlockLight();

        this.markEnd('processTorchlightForChunk');
    }

    private async processSunlightForChunk(chunk: GeneralChunk): Promise<void> {
        if (!this.externalWorld.SUPPORTS_SKY_LIGHT) {
            return;
        }

        this.markStart('processSunlightForChunk');

        // Similar to propagateLightSources in SkyLightEngine.java
        const chunkX = chunk.position.x;
        const chunkZ = chunk.position.z;

        // Get neighboring chunks' light sources
        const northChunk = this.externalWorld.getChunk(chunkX, chunkZ - 1);
        const southChunk = this.externalWorld.getChunk(chunkX, chunkZ + 1);
        const westChunk = this.externalWorld.getChunk(chunkX - 1, chunkZ);
        const eastChunk = this.externalWorld.getChunk(chunkX + 1, chunkZ);

        // Calculate the block coordinates for the chunk
        const startBlockX = chunkX * CHUNK_SIZE;
        const startBlockZ = chunkZ * CHUNK_SIZE;

        // Process each column in the chunk
        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                const globalX = startBlockX + localX;
                const globalZ = startBlockZ + localZ;

                // Find the highest block in the column
                const highestY = this.getHighestBlockInColumn(chunk, localX, localZ);

                // First set full sunlight for all blocks above the highest block
                for (let y = highestY + 1; y < this.WORLD_HEIGHT; y++) {
                    this.setSunLight(globalX, y, globalZ, LightWorld.MAX_LEVEL);
                }

                // Now handle the horizontal propagation at chunk borders
                // This is similar to the propagateLightSources method in SkyLightEngine
                if (localX === 0 || localX === CHUNK_SIZE - 1 || localZ === 0 || localZ === CHUNK_SIZE - 1) {
                    // Get lowest source Y values from neighbors
                    let northLowestY = highestY;
                    let southLowestY = highestY;
                    let westLowestY = highestY;
                    let eastLowestY = highestY;

                    // Get actual values if neighbor chunks exist
                    if (localZ === 0 && northChunk) {
                        northLowestY = this.getHighestBlockInColumn(northChunk, localX, CHUNK_SIZE - 1) + 1;
                    } else if (localZ > 0) {
                        northLowestY = this.getHighestBlockInColumn(chunk, localX, localZ - 1) + 1;
                    }

                    if (localZ === CHUNK_SIZE - 1 && southChunk) {
                        southLowestY = this.getHighestBlockInColumn(southChunk, localX, 0) + 1;
                    } else if (localZ < CHUNK_SIZE - 1) {
                        southLowestY = this.getHighestBlockInColumn(chunk, localX, localZ + 1) + 1;
                    }

                    if (localX === 0 && westChunk) {
                        westLowestY = this.getHighestBlockInColumn(westChunk, CHUNK_SIZE - 1, localZ) + 1;
                    } else if (localX > 0) {
                        westLowestY = this.getHighestBlockInColumn(chunk, localX - 1, localZ) + 1;
                    }

                    if (localX === CHUNK_SIZE - 1 && eastChunk) {
                        eastLowestY = this.getHighestBlockInColumn(eastChunk, 0, localZ) + 1;
                    } else if (localX < CHUNK_SIZE - 1) {
                        eastLowestY = this.getHighestBlockInColumn(chunk, localX + 1, localZ) + 1;
                    }

                    // Take the max of all neighbors
                    const maxNeighborLowestY = Math.max(
                        Math.max(northLowestY, southLowestY),
                        Math.max(westLowestY, eastLowestY)
                    );

                    // Process the column from top to bottom
                    for (let y = highestY; y >= Math.max(this.WORLD_MIN_Y, highestY - 16); y--) {
                        // If we're at the exact edge height or below a neighbor's edge
                        if (y === highestY || y < maxNeighborLowestY) {
                            // Set up directional propagation flags
                            const pos = this.encodeBlockPos(globalX, y, globalZ);
                            const queueEntry = QueueEntry.increaseSkySourceInDirections(
                                y === highestY,               // Downward propagation if at the highest point
                                y < northLowestY,             // North propagation if we're below its edge
                                y < southLowestY,             // South propagation if we're below its edge
                                y < westLowestY,              // West propagation if we're below its edge
                                y < eastLowestY               // East propagation if we're below its edge
                            );

                            // Enqueue for directional propagation
                            this.sunLightIncreaseQueue.push([pos, queueEntry]);
                        }
                    }
                }

                // Process the downward propagation
                let currentLevel = LightWorld.MAX_LEVEL;
                for (let y = highestY; y >= this.WORLD_MIN_Y; y--) {
                    const block = chunk.getBlock(localX, y, localZ);

                    if (block?.isOpaque) {
                        // Opaque blocks get no skylight
                        this.setSunLight(globalX, y, globalZ, 0);
                        currentLevel = 0;
                    } else {
                        // Non-opaque blocks get reduced skylight
                        if (block?.filterLight) {
                            currentLevel = Math.max(0, currentLevel - block.filterLight);
                        } else {
                            currentLevel = Math.max(0, currentLevel - 1);
                        }

                        this.setSunLight(globalX, y, globalZ, currentLevel);
                    }
                }
            }
        }

        // Process all the queued updates
        this.propagateSkyLightUpdates();

        // Mark the chunk as affected for rendering updates
        this.setBlockChunkAffected(chunk.position.x * CHUNK_SIZE, 0, chunk.position.z * CHUNK_SIZE);

        this.markEnd('processSunlightForChunk');
    }

    private addPendingLight(x: number, y: number, z: number,
        info: { x: number, y: number, z: number, dirIndex: number, level: number }): void {
        // This would handle cross-chunk light propagation
        // Mark the neighboring chunk as affected
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        this.setBlockChunkAffected(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);

        // Store the propagation for when the chunk is loaded
        // This could be enhanced to actually queue these operations
        const key = this.getChunkKey(chunkX, chunkZ);
        // For now, we'll just mark it affected
    }

    private filterLight(block: WorldBlock | undefined, lightLevel: number): number {
        if (!block) {
            return Math.max(0, lightLevel - 1);
        }
        if (block.isOpaque && !block.isLightSource) {
            return 0;
        }
        if (block.filterLight) {
            return Math.max(0, lightLevel - 1 - block.filterLight);
        }
        return Math.max(0, lightLevel - 1);
    }

    getLightLevelsString(xStart: number, zStart: number, y: number, xSize: number, zSize: number, type: 'blockLight' | 'skyLight'): string {
        const getLightFn = type === 'blockLight'
            ? (chunk: GeneralChunk, x: number, y: number, z: number) => chunk.getBlockLight(x, y, z)
            : (chunk: GeneralChunk, x: number, y: number, z: number) => chunk.getSunLight(x, y, z);

        const rows: string[] = [];

        for (let z = zStart; z <= zStart + zSize; z++) {
            const row: string[] = [];
            for (let x = xStart; x <= xStart + xSize; x++) {
                const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);

                const lightLevel = chunk ? getLightFn(chunk, localX, y, localZ) : '--';
                row.push(lightLevel.toString().padStart(2, ' '));
            }
            // Format row with padding to align columns
            rows.push('| ' + row.join(' | ') + ' |');
        }

        return rows.join('\n');
    }

    columnCleanup(x: number, z: number): void {
        const key = this.getChunkKey(x, z);
        this.worldLightHolder.unloadChunk(x, z)
        this.chunksProcessed--
    }
}
