import { LightNode, LightRemovalNode, CHUNK_SIZE, MAX_LIGHT_LEVEL, WorldBlock, ExternalWorld, TestWorld, ChunkPosition, GeneralChunk, TEST_BLOCKS } from './externalWorld';
import { WorldLightHolder } from './worldLightHolder';

export class LightWorld {
    public PARALLEL_CHUNK_PROCESSING = true

    // not necessarily needed for the engine to work, but useful for side cases
    public worldLightHolder: WorldLightHolder

    private sunLightQueue: LightNode[] = [];
    private blockLightQueue: LightNode[] = [];
    private lightRemovalQueue: LightRemovalNode[] = [];
    // private pendingCrossChunkLight: Map<string, LightNode[]> = new Map();
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
        // this.setBlockChunkAffected(x, y, z);
        this.externalWorld.setSunLight(x, y, z, value);
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

        // Handle opacity changes affecting sunlight
        if (block.isOpaque) {
            this.updateSunLightRemove(x, y, z);
        } else {
            this.updateSunLightAdd(x, y, z);
        }

        if (autoPropagate) {
            // Propagate light changes if needed
            if (this.lightRemovalQueue.length > 0) {
                this.unPropagateLight();
            }
            if (this.blockLightQueue.length > 0) {
                this.propagateBlockLight();
            }
            if (this.sunLightQueue.length > 0) {
                this.propagateSunLight();
            }
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
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return;

        const lightLevel = this.getSunLight(x, y, z);

        // Add to removal queue with original light level
        this.lightRemovalQueue.push({
            x: localX,
            y,
            z: localZ,
            value: lightLevel,
            chunk
        });

        // Set the light to 0
        this.setSunLight(x, y, z, 0);
    }

    private unPropagateLight(): void {
        while (this.lightRemovalQueue.length > 0) {
            const node = this.lightRemovalQueue.shift()!;
            const { x, y, z, value: lightLevel, chunk } = node;

            const directions = [
                { x: -1, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 },
                { x: 0, y: -1, z: 0 },
                { x: 0, y: 1, z: 0 },
                { x: 0, y: 0, z: -1 },
                { x: 0, y: 0, z: 1 }
            ];

            for (const dir of directions) {
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

    private static readonly MAX_LEVEL = 15;
    private static readonly DIRECTIONS = [
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 }
    ];

    // Enhanced version of updateSunLightRemove based on Minecraft's implementation
    private updateSunLightRemove(x: number, y: number, z: number): void {
        if (!this.externalWorld.SUPPORTS_SKY_LIGHT) return;

        const block = this.getBlock(x, y, z);
        if (!block?.isOpaque) return;

        // First handle the block itself
        const currentLight = this.getSunLight(x, y, z);
        if (currentLight > 0) {
            this.removeSunLight(x, y, z);
        }

        // Then handle the column below (similar to removeSourcesBelow in Minecraft)
        for (let cy = y - 1; cy >= this.WORLD_MIN_Y; cy--) {
            const belowLight = this.getSunLight(x, cy, z);
            if (belowLight === 0) break; // No more light to remove

            const belowBlock = this.getBlock(x, cy, z);
            if (belowBlock?.isOpaque) break; // Opaque block would already block light

            // Add to removal queue with the full value
            this.removeSunLight(x, cy, z);
        }
    }

    // Enhanced version of updateSunLightAdd based on Minecraft's implementation
    private updateSunLightAdd(x: number, y: number, z: number): void {
        if (!this.externalWorld.SUPPORTS_SKY_LIGHT) return;

        const block = this.getBlock(x, y, z);
        if (block?.isOpaque) return; // Opaque blocks don't let sunlight through

        // Check if there's a clear path to the sky (hasDirectSkyAccess)
        let hasSkyAccess = true;
        for (let cy = y + 1; cy < this.WORLD_HEIGHT; cy++) {
            const blockAbove = this.getBlock(x, cy, z);
            if (blockAbove?.isOpaque) {
                hasSkyAccess = false;
                break;
            }
        }

        if (!hasSkyAccess) return; // No direct sky access

        // Set full sunlight at this position
        this.setSunLight(x, y, z, LightWorld.MAX_LEVEL);

        // Add to propagation queue
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (chunk) {
            this.sunLightQueue.push({
                x: localX,
                y,
                z: localZ,
                chunk
            });
        }

        // Propagate downward (similar to addSourcesAbove in Minecraft)
        let currentLevel = LightWorld.MAX_LEVEL;
        for (let cy = y - 1; cy >= this.WORLD_MIN_Y; cy--) {
            const blockBelow = this.getBlock(x, cy, z);

            if (blockBelow?.isOpaque) break; // Stop at opaque blocks

            // Reduce light level by at least 1 (plus filter if any)
            if (blockBelow?.filterLight) {
                currentLevel -= blockBelow.filterLight;
            } else {
                currentLevel -= 1;
            }

            if (currentLevel <= 0) break; // No more light to propagate

            // Set the light and add to queue for horizontal propagation
            this.setSunLight(x, cy, z, currentLevel);

            const { chunk: belowChunk, localX: belowX, localZ: belowZ } = this.getChunkAndLocalCoord(x, cy, z);
            if (belowChunk) {
                this.sunLightQueue.push({
                    x: belowX,
                    y: cy,
                    z: belowZ,
                    chunk: belowChunk
                });
            }
        }
    }

    // Enhanced directional skylight propagation similar to Minecraft's propagateIncrease
    private propagateSunLight(): void {
        this.markStart('propagateSunLight');

        const processed = new Set<string>();

        while (this.sunLightQueue.length > 0) {
            const node = this.sunLightQueue.shift()!;
            const { x, y, z, chunk } = node;

            // Skip if already processed this position
            const nodeKey = `${chunk.position.x},${chunk.position.z},${x},${y},${z}`;
            if (processed.has(nodeKey)) continue;
            processed.add(nodeKey);

            const block = chunk.getBlock(x, y, z);
            const lightLevel = chunk.getSunLight(x, y, z);

            // Skip if this is an opaque block
            if (block?.isOpaque) continue;

            // Minecraft checks each direction and propagates light accordingly
            for (const dir of LightWorld.DIRECTIONS) {
                const globalX = chunk.position.x * CHUNK_SIZE + x + dir.x;
                const newY = y + dir.y;
                const globalZ = chunk.position.z * CHUNK_SIZE + z + dir.z;

                // Skip if Y is out of bounds
                if (newY < this.WORLD_MIN_Y || newY >= this.WORLD_HEIGHT) continue;

                const { chunk: targetChunk, localX: targetX, localZ: targetZ } =
                    this.getChunkAndLocalCoord(globalX, newY, globalZ);

                // Check if target chunk exists
                if (!targetChunk) {
                    this.addPendingLight(globalX, newY, globalZ, chunk);
                    continue;
                }

                const targetBlock = targetChunk.getBlock(targetX, newY, targetZ);
                const currentLight = targetChunk.getSunLight(targetX, newY, targetZ);

                // Calculate new light level based on direction and opacity
                let newLight = lightLevel - 1;
                if (targetBlock?.filterLight) {
                    newLight -= targetBlock.filterLight;
                }

                // Special case for downward propagation (sunlight specific)
                if (dir.y === -1 && !targetBlock?.isOpaque) {
                    // Sunlight only decreases by 1 when going down (if not blocked)
                    newLight = Math.max(0, lightLevel - 1);
                }

                if (newLight <= 0) continue;

                // Only propagate if:
                // 1. Target block can accept light (not opaque)
                // 2. New light level would be higher than current
                if ((!targetBlock?.isOpaque) && currentLight < newLight) {
                    targetChunk.setSunLight(targetX, newY, targetZ, newLight);

                    this.sunLightQueue.push({
                        x: targetX,
                        y: newY,
                        z: targetZ,
                        chunk: targetChunk
                    });
                }
            }
        }

        this.markEnd('propagateSunLight');
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

            const directions = [
                { x: -1, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 },
                { x: 0, y: -1, z: 0 },
                { x: 0, y: 1, z: 0 },
                { x: 0, y: 0, z: -1 },
                { x: 0, y: 0, z: 1 }
            ];

            for (const dir of directions) {
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
                    this.addPendingLight(globalX, newY, globalZ, chunk);
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

    public propagateBlockLight(): void {
        this.markStart('propagateLight');
        this.propagateGeneric(
            this.blockLightQueue,
            (chunk, x, y, z) => chunk.getBlockLight(x, y, z),
            (chunk, x, y, z, value) => chunk.setBlockLight(x, y, z, value),
            this.filterLight
        );
        this.markEnd('propagateLight');
    }

    // calculateInitialSunLight(chunk: GeneralChunk): void {
    //     // Start from the top of each column
    //     for (let x = 0; x < CHUNK_SIZE; x++) {
    //         for (let z = 0; z < CHUNK_SIZE; z++) {
    //             let y = this.getHighestBlockInColumn(chunk, x, z);

    //             // Set full sunlight above highest block
    //             while (y < this.WORLD_HEIGHT) { // Maximum world height
    //                 chunk.setSunLight(x, y, z, MAX_LIGHT_LEVEL);
    //                 this.sunLightQueue.push({ x, y, z, chunk });
    //                 y++;
    //             }
    //         }
    //     }

    //     this.propagateSunLight();
    // }

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

    // Update this method to only process torch light sources
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

        // Process skylight for the entire chunk column by column
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const highestBlockY = this.getHighestBlockInColumn(chunk, x, z);

                // Set full sunlight above the highest block
                for (let y = highestBlockY + 1; y < this.WORLD_HEIGHT; y++) {
                    const globalX = chunk.position.x * CHUNK_SIZE + x;
                    const globalZ = chunk.position.z * CHUNK_SIZE + z;
                    this.setSunLight(globalX, y, globalZ, LightWorld.MAX_LEVEL);
                }

                // Add the top air block to the queue for horizontal propagation
                if (highestBlockY < this.WORLD_HEIGHT - 1) {
                    const topAirY = highestBlockY + 1;
                    this.sunLightQueue.push({
                        x,
                        y: topAirY,
                        z,
                        chunk
                    });
                }

                // Process downwards starting from highest block
                let currentLevel = LightWorld.MAX_LEVEL;
                for (let y = highestBlockY; y >= this.WORLD_MIN_Y; y--) {
                    const block = chunk.getBlock(x, y, z);
                    const globalX = chunk.position.x * CHUNK_SIZE + x;
                    const globalZ = chunk.position.z * CHUNK_SIZE + z;

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

                        if (currentLevel > 0) {
                            // Add to queue for horizontal propagation
                            this.sunLightQueue.push({
                                x,
                                y,
                                z,
                                chunk
                            });
                        }
                    }
                }
            }
        }

        // Propagate the light horizontally
        await this.propagateSunLight();

        // Mark the chunk as affected for rendering updates
        this.setBlockChunkAffected(chunk.position.x * CHUNK_SIZE, 0, chunk.position.z * CHUNK_SIZE);

        this.markEnd('processSunlightForChunk');
    }

    private addPendingLight(x: number, y: number, z: number, chunk: GeneralChunk) {
        const { chunk: targetChunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(chunkX, chunkZ);

        // if (!this.pendingCrossChunkLight.has(key)) {
        //     this.pendingCrossChunkLight.set(key, []);
        // }

        // this.pendingCrossChunkLight.get(key)!.push({ x: localX, y, z: localZ, chunk });
        // TODO!!!
        // throw new Error('Not implemented')
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

                // const lightLevel = chunk ? `${x} ${y} ${z} ${getLightFn(chunk, localX, y, localZ)}` : '--';
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
        // Remove any pending light propagation for this chunk
        // this.pendingCrossChunkLight.delete(key);

        // Also remove any pending propagation targeting this chunk's neighbors
        // const neighborKeys = [
        //     this.getChunkKey(x - 1, z),
        //     this.getChunkKey(x + 1, z),
        //     this.getChunkKey(x, z - 1),
        //     this.getChunkKey(x, z + 1)
        // ];

        // for (const neighborKey of neighborKeys) {
        //     this.pendingCrossChunkLight.delete(neighborKey);
        // }
    }
}
