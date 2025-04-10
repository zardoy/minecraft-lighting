import { CHUNK_SIZE } from './externalWorld';

export interface ChunkLightData {
    blockLight: Uint8Array;
    skyLight: Uint8Array;
    position: { x: number; z: number };
}

interface DumpedChunkLightData extends ChunkLightData {
    worldHeight: number;
    worldMinY: number;
}

export class WorldLightHolder {
    private chunks: Map<string, ChunkLightData> = new Map();
    private worldHeight: number;
    private worldMinY: number;

    constructor(worldHeight: number, worldMinY: number) {
        this.worldHeight = worldHeight;
        this.worldMinY = worldMinY;
    }

    private getChunkKey(x: number, z: number): string {
        return `${x},${z}`;
    }

    private getIndex(x: number, y: number, z: number): number {
        const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localY = y - this.worldMinY;
        return localX + localZ * CHUNK_SIZE + localY * CHUNK_SIZE * CHUNK_SIZE;
    }

    public setBlockLight(x: number, y: number, z: number, value: number): void {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(chunkX, chunkZ);

        let chunk = this.chunks.get(key);
        if (!chunk) {
            const size = CHUNK_SIZE * CHUNK_SIZE * (this.worldHeight - this.worldMinY);
            chunk = {
                blockLight: new Uint8Array(size),
                skyLight: new Uint8Array(size),
                position: { x: chunkX, z: chunkZ },
            };
            this.chunks.set(key, chunk);
        }

        const index = this.getIndex(x, y, z);
        chunk.blockLight[index] = value;
    }

    public setSkyLight(x: number, y: number, z: number, value: number): void {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(chunkX, chunkZ);

        let chunk = this.chunks.get(key);
        if (!chunk) {
            const size = CHUNK_SIZE * CHUNK_SIZE * (this.worldHeight - this.worldMinY);
            chunk = {
                blockLight: new Uint8Array(size),
                skyLight: new Uint8Array(size),
                position: { x: chunkX, z: chunkZ },
            };
            this.chunks.set(key, chunk);
        }

        const index = this.getIndex(x, y, z);
        chunk.skyLight[index] = value;
    }

    public getBlockLight(x: number, y: number, z: number): number {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.chunks.get(this.getChunkKey(chunkX, chunkZ));
        if (!chunk) return 0;

        const index = this.getIndex(x, y, z);
        return chunk.blockLight[index] ?? 0;
    }

    public getSkyLight(x: number, y: number, z: number): number {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunk = this.chunks.get(this.getChunkKey(chunkX, chunkZ));
        if (!chunk) return 0;

        const index = this.getIndex(x, y, z);
        return chunk.skyLight[index] ?? 0;
    }

    public dumpChunk(x: number, z: number): DumpedChunkLightData | undefined {
        const key = this.getChunkKey(x, z);
        const chunk = this.chunks.get(key);
        if (!chunk) return undefined;

        // Create a deep copy of the chunk data
        return {
            blockLight: new Uint8Array(chunk.blockLight),
            skyLight: new Uint8Array(chunk.skyLight),
            position: { ...chunk.position },
            worldHeight: this.worldHeight,
            worldMinY: this.worldMinY
        };
    }

    public loadChunk(data: DumpedChunkLightData): void {
        const key = this.getChunkKey(data.position.x, data.position.z);
        this.worldMinY = data.worldMinY;
        this.worldHeight = data.worldHeight;
        this.chunks.set(key, {
            blockLight: new Uint8Array(data.blockLight),
            skyLight: new Uint8Array(data.skyLight),
            position: { ...data.position },
        });
    }

    public hasChunk(x: number, z: number): boolean {
        return this.chunks.has(this.getChunkKey(x, z));
    }

    public unloadChunk(x: number, z: number): void {
        this.chunks.delete(this.getChunkKey(x, z));
    }

    public getWorldHeight(): number {
        return this.worldHeight;
    }

    public getWorldMinY(): number {
        return this.worldMinY;
    }
}
