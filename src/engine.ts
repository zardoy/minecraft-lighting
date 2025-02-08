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

interface LightRemovalNode extends LightNode {
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

export class ChunkSection {
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

export class Chunk {
    public sections: Map<number, ChunkSection>;
    public position: ChunkPosition;
    public isLoaded: boolean = false;

    constructor(position: ChunkPosition, public world?: ExternalWorld) {
        this.position = position;
        this.sections = new Map();
    }

    getSection(y: number): ChunkSection {
        if (!this.sections.has(y)) {
            this.sections.set(y, new ChunkSection({
                x: this.position.x,
                y,
                z: this.position.z
            }));
        }
        return this.sections.get(y)!;
    }

    getSectionNoCreate(y: number): ChunkSection | undefined {
        return this.sections.get(y);
    }

    getBlock(x: number, y: number, z: number): WorldBlock | undefined {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        return this.getSectionNoCreate(sectionY)?.getBlock(x, localY, z);
    }

    setBlock(x: number, y: number, z: number, blockId: number): void {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        this.getSection(sectionY).setBlock(x, localY, z, blockId);
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        this.getSection(sectionY).setBlockLight(x, localY, z, value);
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        this.getSection(sectionY).setSunLight(x, localY, z, value);
    }

    getBlockLight(x: number, y: number, z: number): number {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        return this.getSection(sectionY).getBlockLight(x, localY, z);
    }

    getSunLight(x: number, y: number, z: number): number {
        const sectionY = Math.floor(y / CHUNK_SIZE);
        const localY = y % CHUNK_SIZE;
        return this.getSection(sectionY).getSunLight(x, localY, z);
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
    private chunks: Map<string, Chunk> = new Map();
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
            chunk = new Chunk({ x: chunkX, z: chunkZ }, this);
            this.setChunk(chunkX, chunkZ, chunk);
        }

        const localX = x % CHUNK_SIZE;
        const localZ = z % CHUNK_SIZE;
        chunk.setBlock(localX, y, localZ, blockId);
    }

    getChunk(x: number, z: number): Chunk | undefined {
        return this.chunks.get(`${x},${z}`);
    }

    hasChunk(x: number, z: number): boolean {
        return this.chunks.has(`${x},${z}`);
    }

    setChunk(x: number, z: number, chunk: Chunk | undefined): void {
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

export class World {
    private sunLightQueue: LightNode[] = [];
    private blockLightQueue: LightNode[] = [];
    private pendingCrossChunkLight: Map<string, LightNode[]> = new Map();
    private pendingLightUpdates: LightProcessingQueue[] = [];
    private isProcessingLight = false;
    public performanceStats: Map<string, { calls: number, totalTime: number }> = new Map();

    constructor(private externalWorld: ExternalWorld = new TestWorld()) {}

    get WORLD_HEIGHT() {
        return this.externalWorld.WORLD_HEIGHT;
    }

    get WORLD_MIN_Y() {
        return this.externalWorld.WORLD_MIN_Y;
    }

    getBlock(x: number, y: number, z: number): WorldBlock | undefined {
        return this.externalWorld.getBlock(x, y, z);
    }

    setBlock(x: number, y: number, z: number, block: WorldBlock, autoPropagate = true): void {
        const oldBlock = this.getBlock(x, y, z);
        const oldBlockLight = this.getBlockLight(x, y, z);
        const oldSunLight = this.getSunLight(x, y, z);

        // Set the new block
        this.externalWorld.setBlock(x, y, z, block.id);

        // Handle light source changes
        if (oldBlock?.isLightSource && !block.isLightSource) {
            // Old block was a light source but new one isn't - remove light
            this.pushChangedBlockLight(x, y, z, 0);
        } else if (!oldBlock?.isLightSource && block.isLightSource) {
            // New block is a light source but old one wasn't - add light
            this.pushChangedBlockLight(x, y, z, block.lightEmission);
        }

        // Handle opacity changes affecting existing light
        if (!oldBlock?.isOpaque && block.isOpaque) {
            // New block is opaque but old one wasn't - remove any existing light
            if (oldBlockLight > 0) {
                this.pushChangedBlockLight(x, y, z, 0);
            }
            if (oldSunLight > 0) {
                this.pushChangedSunLight(x, y, z, 0);
            }
        }

        if (autoPropagate) {
            // Propagate light changes if needed
            if (this.blockLightQueue.length > 0) {
                this.propagateLight();
            }
            if (this.sunLightQueue.length > 0 && this.externalWorld.SUPPORTS_SKY_LIGHT) {
                this.propagateSunLight();
            }
        }
    }

    pushChangedBlockLight(x: number, y: number, z: number, newValue: number) {
        this.setBlockLight(x, y, z, newValue);
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ)!;

        this.blockLightQueue.push({
            x: x % CHUNK_SIZE,
            y,
            z: z % CHUNK_SIZE,
            chunk
        });
    }

    pushChangedSunLight(x: number, y: number, z: number, newValue: number) {
        this.setSunLight(x, y, z, newValue);
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ)!;

        this.sunLightQueue.push({
            x: x % CHUNK_SIZE,
            y,
            z: z % CHUNK_SIZE,
            chunk
        });
    }

    getChunk(x: number, z: number): Chunk | undefined {
        return this.externalWorld.getChunk(x, z);
    }

    hasChunk(x: number, z: number): boolean {
        return this.externalWorld.hasChunk?.(x, z) ?? this.getChunk(x, z) !== undefined;
    }

    getBlockLight(x: number, y: number, z: number): number {
        return this.externalWorld.getBlockLight(x, y, z);
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        this.externalWorld.setBlockLight(x, y, z, value);
    }

    getSunLight(x: number, y: number, z: number): number {
        return this.externalWorld.getSunLight(x, y, z);
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
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

        // Start binary search from middle of world height
        // let low = this.WORLD_MIN_Y;
        // let high = this.WORLD_HEIGHT - 1;
        // let lastSolidBlock = this.WORLD_MIN_Y - 1;

        // // First check the middle section where terrain is most likely
        // const mid = Math.floor((low + high) / 2);
        // const block = chunk.getBlock(x, mid, z);

        // // If block found at mid, search upwards from there
        // if (block && block.id !== TEST_BLOCKS.air.id) {
        //     low = mid;
        // } else {
        //     // If no block at mid, search downwards
        //     high = mid;
        // }

        // // Binary search to find highest non-air block
        // while (low <= high) {
        //     const mid = Math.floor((low + high) / 2);
        //     const block = chunk.getBlock(x, mid, z);
        //     const blockAbove = chunk.getBlock(x, mid + 1, z);

        //     // Found transition from solid to air
        //     if (block && block.id !== TEST_BLOCKS.air.id &&
        //         (!blockAbove || blockAbove.id === TEST_BLOCKS.air.id)) {
        //         return mid;
        //     }

        //     // If current block is solid, look higher
        //     if (block && block.id !== TEST_BLOCKS.air.id) {
        //         lastSolidBlock = Math.max(lastSolidBlock, mid);
        //         low = mid + 1;
        //     } else {
        //         // If current block is air, look lower
        //         high = mid - 1;
        //     }
        // }

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

    private propagateGeneric(
        queue: LightNode[],
        getLightFn: (chunk: Chunk, x: number, y: number, z: number) => number,
        setLightFn: (chunk: Chunk, x: number, y: number, z: number, value: number) => void,
        filterFn: (block: WorldBlock | undefined, level: number) => number
    ): void {
        const processed = new Set<string>();  // Track processed nodes

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

            // If this is an opaque block and it's not the source of light, skip propagation
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
                const newX = x + dir.x;
                const newY = y + dir.y;
                const newZ = z + dir.z;

                // Skip if Y is out of bounds
                if (newY < this.WORLD_MIN_Y || newY >= this.WORLD_HEIGHT) {
                    continue;
                }

                // Handle chunk boundaries
                let targetChunkX = chunk.position.x;
                let targetChunkZ = chunk.position.z;
                let targetX = newX;
                let targetZ = newZ;

                if (newX < 0) {
                    targetChunkX--;
                    targetX = CHUNK_SIZE - 1;
                } else if (newX >= CHUNK_SIZE) {
                    targetChunkX++;
                    targetX = 0;
                }

                if (newZ < 0) {
                    targetChunkZ--;
                    targetZ = CHUNK_SIZE - 1;
                } else if (newZ >= CHUNK_SIZE) {
                    targetChunkZ++;
                    targetZ = 0;
                }

                // Check if target chunk exists
                if (!this.hasChunk(targetChunkX, targetChunkZ)) {
                    // Store this propagation for when the chunk loads
                    this.addPendingLight(targetX, newY, targetZ, chunk);
                    continue;
                }

                const targetChunk = this.externalWorld.getChunk(targetChunkX, targetChunkZ)!;
                const targetBlock = targetChunk.getBlock(targetX, newY, targetZ);
                const currentLight = getLightFn(targetChunk, targetX, newY, targetZ);
                const newLight = filterFn(targetBlock, lightLevel);

                if (currentLight < newLight) {
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

    receiveUpdateColumn(x: number, z: number): void {
        // Create/update chunk
        const chunk = this.externalWorld.getChunk(x, z)!;
        if (!chunk) {
            throw new Error(`Chunk ${x},${z} not loaded yet`);
        }

        // Process any pending cross-chunk light propagation for this chunk
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

        // Queue for sunlight processing
        this.queueLightUpdate({
            column: { x, z },
            priority: 1
        });
    }

    private queueLightUpdate(update: LightProcessingQueue): void {
        // Higher priority updates go first
        const index = this.pendingLightUpdates.findIndex(u => u.priority < update.priority);
        if (index === -1) {
            this.pendingLightUpdates.push(update);
        } else {
            this.pendingLightUpdates.splice(index, 0, update);
        }

        // Start processing if not already running
        if (!this.isProcessingLight) {
            this.processLightQueue();
        }
    }

    private async processLightQueue(): Promise<void> {
        this.markStart('processLightQueue');
        this.isProcessingLight = true;

        try {
            while (this.pendingLightUpdates.length > 0) {
                const update = this.pendingLightUpdates.shift()!;
                const { column } = update;
                const chunk = this.externalWorld.getChunk(column.x, column.z);
                if (!chunk) continue // might be unloaded at this point

                // Process sunlight first
                await this.processSunlightForChunk(chunk);

                // Then process torch lights
                await this.processTorchlightForChunk(chunk);

                // Allow other operations to happen
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        } finally {
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

    getLightLevelsString(xStart: number, zStart: number, y: number, xEnd: number, zEnd: number, type: 'blockLight' | 'skyLight'): string {
        const getLightFn = type === 'blockLight'
            ? (chunk: Chunk, x: number, y: number, z: number) => chunk.getBlockLight(x, y, z)
            : (chunk: Chunk, x: number, y: number, z: number) => chunk.getSunLight(x, y, z);

        const rows: string[] = [];

        for (let z = zStart; z <= zEnd; z++) {
            const row: string[] = [];
            for (let x = xStart; x <= xEnd; x++) {
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

    private addPendingLight(x: number, y: number, z: number, chunk: Chunk) {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(chunkX, chunkZ);

        if (!this.pendingCrossChunkLight.has(key)) {
            this.pendingCrossChunkLight.set(key, []);
        }

        this.pendingCrossChunkLight.get(key)!.push({ x, y, z, chunk });
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
}
