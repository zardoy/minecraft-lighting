export const CHUNK_SIZE = 16;
export const MAX_LIGHT_LEVEL = 15;

globalThis._debug_get_block_count = 0

// Types
export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface ChunkPosition {
    x: number;
    z: number;
}

export interface LightNode {
    x: number;
    y: number;
    z: number;
    chunk: Chunk;
}

export interface LightRemovalNode extends LightNode {
    value: number;
}

export interface WorldBlock {
    id: number;
    isOpaque: boolean;
    isLightSource: boolean;
    lightEmission: number;
    filterLight?: number
}

export const TEST_BLOCKS = {
    stone: {
        id: 1,
        isOpaque: true,
        isLightSource: false,
        lightEmission: 0,
        filterLight: 0
    },
    glowstone: {
        id: 2,
        isOpaque: false,
        isLightSource: true,
        lightEmission: 15,
        filterLight: 0
    },
    glass: {
        id: 20,
        isOpaque: false,
        isLightSource: false,
        lightEmission: 0,
        filterLight: 0
    },
    water: {
        id: 8,
        isOpaque: false,
        isLightSource: false,
        lightEmission: 0,
        filterLight: 2
    },
    air: {
        id: 0,
        isOpaque: false,
        isLightSource: false,
        lightEmission: 0,
        filterLight: 0
    }
} satisfies Record<string, WorldBlock>
const TEST_BLOCKS_BY_ID = Object.entries(TEST_BLOCKS).reduce((acc, [key, block]) => {
    acc[block.id] = block;
    return acc;
}, {} as Record<number, WorldBlock>);

export class TestChunkSection {
    private blocks: Uint8Array;
    private lightData: Uint8Array;
    private position: Vector3;
    private isLoaded: boolean = false;

    constructor(position: Vector3) {
        this.position = position;
        this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        this.lightData = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    }

    getBlock(x: number, y: number, z: number): WorldBlock {
        globalThis._debug_get_block_count++
        const index = this.getIndex(x, y, z);
        const blockId = this.blocks[index];
        if (!blockId) {
            return {
                id: 0,
                isOpaque: false,
                isLightSource: false,
                lightEmission: 0
            }
        }
        const BLOCK = TEST_BLOCKS_BY_ID[blockId];
        if (!BLOCK) {
            throw new Error(`Block ${blockId} not found`);
        }
        return {
            id: blockId,
            isOpaque: BLOCK.isOpaque,
            isLightSource: BLOCK.isLightSource,
            lightEmission: BLOCK.lightEmission
        };
    }

    getBlockLight(x: number, y: number, z: number): number {
        const index = this.getIndex(x, y, z);
        return this.lightData[index]! & 0x0F;
    }

    getSunLight(x: number, y: number, z: number): number {
        const index = this.getIndex(x, y, z);
        return (this.lightData[index]! >> 4) & 0x0F;
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        const index = this.getIndex(x, y, z);
        this.lightData[index] = (this.lightData[index]! & 0xF0) | (value & 0x0F);
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
        const index = this.getIndex(x, y, z);
        this.lightData[index] = (this.lightData[index]! & 0x0F) | ((value & 0x0F) << 4);
    }

    setBlock(x: number, y: number, z: number, blockId: number): void {
        const index = this.getIndex(x, y, z);
        this.blocks[index] = blockId;
    }

    private getIndex(x: number, y: number, z: number): number {
        return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
    }
}

interface Chunk {
    position: ChunkPosition;
    getBlock(x: number, y: number, z: number): WorldBlock | undefined;
    getBlockLight(x: number, y: number, z: number): number;
    setBlockLight(x: number, y: number, z: number, value: number): void;
    getSunLight(x: number, y: number, z: number): number;
    setSunLight(x: number, y: number, z: number, value: number): void;
}

export class TestChunk implements Chunk {
    public sections: Map<number, TestChunkSection>;
    public position: ChunkPosition;
    public isLoaded: boolean = false;

    constructor(position: ChunkPosition, public world?: ExternalWorld) {
        this.position = position;
        this.sections = new Map();
    }

    getSection(y: number): TestChunkSection {
        if (!this.sections.has(y)) {
            this.sections.set(y, new TestChunkSection({
                x: this.position.x,
                y,
                z: this.position.z
            }));
        }
        return this.sections.get(y)!;
    }

    getSectionNoCreate(y: number): TestChunkSection | undefined {
        return this.sections.get(y);
    }

    getBlock(x: number, y: number, z: number): WorldBlock | undefined {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        const section = this.getSectionNoCreate(sectionY);
        if (!section) return TEST_BLOCKS.air;
        return section.getBlock(x, localY, z);
    }

    setBlock(x: number, y: number, z: number, blockId: number): void {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        this.getSection(sectionY).setBlock(x, localY, z, blockId);
    }

    getBlockLight(x: number, y: number, z: number): number {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        const section = this.getSectionNoCreate(sectionY);
        if (!section) return 0;
        return section.getBlockLight(x, localY, z);
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        this.getSection(sectionY).setBlockLight(x, localY, z, value);
    }

    getSunLight(x: number, y: number, z: number): number {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        const section = this.getSectionNoCreate(sectionY);
        if (!section) return 0;
        return section.getSunLight(x, localY, z);
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        this.getSection(sectionY).setSunLight(x, localY, z, value);
    }
}

interface LightProcessingQueue {
    column: ChunkPosition;
    priority: number;
}

export interface ExternalWorld {
    WORLD_HEIGHT: number;
    WORLD_MIN_Y: number;
    SUPPORTS_SKY_LIGHT: boolean;

    getBlock(x: number, y: number, z: number): WorldBlock | undefined;
    setBlock(x: number, y: number, z: number, blockId: number): void;
    getHighestBlockInColumn?(chunk: Chunk, x: number, z: number): number // use only if provided
    getChunk(x: number, z: number): Chunk | undefined;
    getBlockLight(x: number, y: number, z: number): number;
    setBlockLight(x: number, y: number, z: number, value: number): void;
    getSunLight(x: number, y: number, z: number): number;
    setSunLight(x: number, y: number, z: number, value: number): void;
    hasChunk?(x: number, z: number): boolean;
}

export class TestWorld implements ExternalWorld {
    private chunks: Map<string, TestChunk> = new Map();
    readonly WORLD_HEIGHT = 384;
    readonly WORLD_MIN_Y = -64;
    readonly SUPPORTS_SKY_LIGHT = false;

    getBlock(x: number, y: number, z: number): WorldBlock | undefined {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) return TEST_BLOCKS.air;

        const localX = x % CHUNK_SIZE;
        const localZ = z % CHUNK_SIZE;
        return chunk.getBlock(localX, y, localZ);
    }

    setBlock(x: number, y: number, z: number, blockId: number): void {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        let chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) {
            chunk = new TestChunk({ x: chunkX, z: chunkZ }, this);
            this.setChunk(chunkX, chunkZ, chunk);
        }

        const localX = x % CHUNK_SIZE;
        const localZ = z % CHUNK_SIZE;
        chunk.setBlock(localX, y, localZ, blockId);
    }

    getChunk(x: number, z: number): TestChunk | undefined {
        return this.chunks.get(`${x},${z}`);
    }

    hasChunk(x: number, z: number): boolean {
        return this.chunks.has(`${x},${z}`);
    }

    setChunk(x: number, z: number, chunk: TestChunk | undefined): void {
        if (chunk) {
            this.chunks.set(`${x},${z}`, chunk);
        } else {
            this.chunks.delete(`${x},${z}`);
        }
    }

    getBlockLight(x: number, y: number, z: number): number {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) return 0;

        const localX = x % CHUNK_SIZE;
        const localZ = z % CHUNK_SIZE;
        return chunk.getBlockLight(localX, y, localZ);
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) return

        const localX = x % CHUNK_SIZE;
        const localZ = z % CHUNK_SIZE;
        chunk.setBlockLight(localX, y, localZ, value);
    }

    getSunLight(x: number, y: number, z: number): number {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) return 0;

        const localX = x % CHUNK_SIZE;
        const localZ = z % CHUNK_SIZE;
        return chunk.getSunLight(localX, y, localZ);
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) return;

        const localX = x % CHUNK_SIZE;
        const localZ = z % CHUNK_SIZE;
        chunk.setSunLight(localX, y, localZ, value);
    }

    // getHighestBlockInColumn(chunk: Chunk, x: number, z: number): number {
    //     for (let y = this.WORLD_HEIGHT - 1; y >= this.WORLD_MIN_Y; y--) {
    //         const block = chunk.getBlock(x, y, z);
    //         if (block?.id !== TEST_BLOCKS.air.id) {
    //             return y;
    //         }
    //     }
    //     return this.WORLD_MIN_Y;
    // }
}

export class LightWorld {
    private sunLightQueue: LightNode[] = [];
    private blockLightQueue: LightNode[] = [];
    private lightRemovalQueue: LightRemovalNode[] = [];
    private pendingCrossChunkLight: Map<string, LightNode[]> = new Map();
    private pendingLightUpdates: LightProcessingQueue[] = [];
    private isProcessingLight = false;
    public performanceStats: Map<string, { calls: number, totalTime: number }> = new Map();
    private affectedChunksTimestamps: Map<string, number> = new Map();

    constructor(private externalWorld: ExternalWorld = new TestWorld()) {}

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
        this.affectedChunksTimestamps.set(key, Date.now());
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

    getHighestBlockInColumn(chunk: Chunk, x: number, z: number): number {
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
        if (oldSunLight > 0 && this.externalWorld.SUPPORTS_SKY_LIGHT) {
            this.removeSunLight(x, y, z);
        }

        // Set the new block
        this.externalWorld.setBlock(x, y, z, block.id);

        // If the new block is a light source, add its light
        if (block.isLightSource) {
            this.setBlockLight(x, y, z, block.lightEmission);
            const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
            this.blockLightQueue.push({
                x: localX,
                y,
                z: localZ,
                chunk: chunk!
            });
        }

        // Handle opacity changes affecting sunlight
        if (this.externalWorld.SUPPORTS_SKY_LIGHT) {
            if (block.isOpaque) {
                this.updateSunLightRemove(x, y, z);
            } else {
                this.updateSunLightAdd(x, y, z);
            }
        }

        if (autoPropagate) {
            // Propagate light changes if needed
            if (this.lightRemovalQueue.length > 0) {
                this.unPropagateLight();
            }
            if (this.blockLightQueue.length > 0) {
                this.propagateLight();
            }
            if (this.sunLightQueue.length > 0 && this.externalWorld.SUPPORTS_SKY_LIGHT) {
                this.propagateSunLight();
            }
        }
    }

    private getChunkAndLocalCoord(
        globalX: number,
        y: number,
        globalZ: number
    ): { chunk: Chunk | undefined; localX: number; localZ: number } {
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

    private updateSunLightRemove(x: number, y: number, z: number): void {
        // Remove sunlight at this position and propagate removal downward
        for (let cy = y; cy >= this.WORLD_MIN_Y; cy--) {
            const currentLight = this.getSunLight(x, cy, z);
            if (currentLight === 0) break;

            this.removeSunLight(x, cy, z);
        }
    }

    private updateSunLightAdd(x: number, y: number, z: number): void {
        // Check if there's a clear path to the sky
        for (let cy = y + 1; cy < this.WORLD_HEIGHT; cy++) {
            const block = this.getBlock(x, cy, z);
            if (block?.isOpaque) return; // No direct sunlight
        }

        // Add full sunlight and propagate downward
        for (let cy = y; cy >= this.WORLD_MIN_Y; cy--) {
            const block = this.getBlock(x, cy, z);
            if (block?.isOpaque) break;

            this.setSunLight(x, cy, z, MAX_LIGHT_LEVEL);
            const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, cy, z);
            this.sunLightQueue.push({
                x: localX,
                y: cy,
                z: localZ,
                chunk: chunk!
            });
        }
    }

    private propagateGeneric(
        queue: LightNode[],
        getLightFn: (chunk: Chunk, x: number, y: number, z: number) => number,
        setLightFn: (chunk: Chunk, x: number, y: number, z: number, value: number) => void,
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

    public propagateLight(): void {
        this.markStart('propagateLight');
        this.propagateGeneric(
            this.blockLightQueue,
            (chunk, x, y, z) => chunk.getBlockLight(x, y, z),
            (chunk, x, y, z, value) => chunk.setBlockLight(x, y, z, value),
            this.filterLight
        );
        this.markEnd('propagateLight');
    }

    private propagateSunLight(): void {
        this.markStart('propagateSunLight');
        this.propagateGeneric(
            this.sunLightQueue,
            (chunk, x, y, z) => chunk.getSunLight(x, y, z),
            (chunk, x, y, z, value) => chunk.setSunLight(x, y, z, value),
            this.filterLight
        );
        this.markEnd('propagateSunLight');
    }

    calculateInitialSunLight(chunk: Chunk): void {
        // Start from the top of each column
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                let y = this.getHighestBlockInColumn(chunk, x, z);

                // Set full sunlight above highest block
                while (y < this.WORLD_HEIGHT) { // Maximum world height
                    chunk.setSunLight(x, y, z, MAX_LIGHT_LEVEL);
                    this.sunLightQueue.push({ x, y, z, chunk });
                    y++;
                }
            }
        }

        this.propagateSunLight();
    }

    async receiveUpdateColumn(x: number, z: number): Promise<ChunkPosition[]> {
        const chunk = this.externalWorld.getChunk(x, z)!;
        if (!chunk) {
            throw new Error(`Chunk ${x},${z} not loaded yet`);
        }

        // Set start time for this light operation
        const currentLightOperationStart = Date.now();

        // Process pending lights...
        const key = this.getChunkKey(x, z);
        const pendingLights = this.pendingCrossChunkLight.get(key) || [];
        if (pendingLights.length > 0) {
            this.blockLightQueue.push(...pendingLights.map(pos => ({
                x: pos.x,
                y: pos.y,
                z: pos.z,
                chunk
            })));
            this.pendingCrossChunkLight.delete(key);
        }

        const update = {
            column: { x, z },
            priority: 1
        };

        this.pendingLightUpdates.push(update);
        if (!this.isProcessingLight) {
            void this.processLightQueue();
        }

        await new Promise<void>(resolve => {
            const checkComplete = () => {
                if (!this.pendingLightUpdates.includes(update)) {
                    resolve();
                } else {
                    setTimeout(checkComplete, 10);
                }
            };
            checkComplete();
        });

        // Get affected chunks that were modified after operation start
        const affectedChunks = Array.from(this.affectedChunksTimestamps.entries())
            .filter(([_, timestamp]) => timestamp >= currentLightOperationStart)
            .map(([key]) => {
                const [chunkX, chunkZ] = key.split(',').map(Number) as [number, number];
                return { x: chunkX, z: chunkZ };
            });

        return affectedChunks;
    }

    private async processLightQueue(): Promise<void> {
        this.markStart('processLightQueue');
        this.isProcessingLight = true;

        try {
            while (this.pendingLightUpdates.length > 0) {
                const update = this.pendingLightUpdates.shift()!;
                const { column } = update;
                const chunk = this.externalWorld.getChunk(column.x, column.z);
                if (!chunk) continue;

                await this.processSunlightForChunk(chunk);
                await this.processTorchlightForChunk(chunk);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        } finally {
            // Clear timestamps when all processing is done
            this.affectedChunksTimestamps.clear();
            this.isProcessingLight = false;
            this.markEnd('processLightQueue');
        }
    }

    private async processSunlightForChunk(chunk: Chunk): Promise<void> {
        if (!this.externalWorld.SUPPORTS_SKY_LIGHT) {
            return;
        }

        this.markStart('processSunlightForChunk');
        // Calculate initial sunlight
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const y = this.getHighestBlockInColumn(chunk, x, z);

                // Set full sunlight above highest block
                for (let cy = y + 1; cy < this.WORLD_HEIGHT; cy++) {
                    const globalX = chunk.position.x * CHUNK_SIZE + x;
                    const globalZ = chunk.position.z * CHUNK_SIZE + z;
                    this.setSunLight(globalX, cy, globalZ, MAX_LIGHT_LEVEL);
                    this.sunLightQueue.push({ x, y: cy, z, chunk });
                }
            }
        }

        // Propagate sunlight
        await this.propagateSunLight();
        this.markEnd('processSunlightForChunk');
    }

    private async processTorchlightForChunk(chunk: Chunk): Promise<void> {
        this.markStart('processTorchlightForChunk');
        // Find all light sources in chunk
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                for (let y = this.WORLD_MIN_Y; y < this.WORLD_HEIGHT; y++) {
                    const block = chunk.getBlock(x, y, z);
                    if (block?.isLightSource) {
                        const globalX = chunk.position.x * CHUNK_SIZE + x;
                        const globalZ = chunk.position.z * CHUNK_SIZE + z;
                        this.setBlockLight(globalX, y, globalZ, block.lightEmission);
                        this.blockLightQueue.push({
                            x,
                            y,
                            z,
                            chunk
                        })
                    }
                }
            }
        }

        // Propagate torch light
        await this.propagateLight();
        this.markEnd('processTorchlightForChunk');
    }

    private addPendingLight(x: number, y: number, z: number, chunk: Chunk) {
        const { chunk: targetChunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(chunkX, chunkZ);

        if (!this.pendingCrossChunkLight.has(key)) {
            this.pendingCrossChunkLight.set(key, []);
        }

        this.pendingCrossChunkLight.get(key)!.push({ x: localX, y, z: localZ, chunk });
    }

    private filterLight(block: WorldBlock | undefined, lightLevel: number): number {
        if (!block) {
            return Math.max(0, lightLevel - 1);
        }
        if (block.isOpaque && !block.isLightSource) {
            return 0;
        }
        if (block.filterLight) {
            return Math.max(0, lightLevel - block.filterLight);
        }
        return Math.max(0, lightLevel - 1);
    }

    getLightLevelsString(xStart: number, zStart: number, y: number, xSize: number, zSize: number, type: 'blockLight' | 'skyLight'): string {
        const getLightFn = type === 'blockLight'
            ? (chunk: Chunk, x: number, y: number, z: number) => chunk.getBlockLight(x, y, z)
            : (chunk: Chunk, x: number, y: number, z: number) => chunk.getSunLight(x, y, z);

        const rows: string[] = [];

        for (let z = zStart; z <= zStart + zSize; z++) {
            const row: string[] = [];
            for (let x = xStart; x <= xStart + xSize; x++) {
                const chunkX = Math.floor(x / CHUNK_SIZE);
                const chunkZ = Math.floor(z / CHUNK_SIZE);
                const localX = x % CHUNK_SIZE;
                const localZ = z % CHUNK_SIZE;

                const chunk = this.externalWorld.getChunk(chunkX, chunkZ);
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
        // Remove any pending light propagation for this chunk
        this.pendingCrossChunkLight.delete(key);

        // Also remove any pending propagation targeting this chunk's neighbors
        const neighborKeys = [
            this.getChunkKey(x - 1, z),
            this.getChunkKey(x + 1, z),
            this.getChunkKey(x, z - 1),
            this.getChunkKey(x, z + 1)
        ];

        for (const neighborKey of neighborKeys) {
            this.pendingCrossChunkLight.delete(neighborKey);
        }
    }
}
