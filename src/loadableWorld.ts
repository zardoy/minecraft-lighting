import { ExternalWorld, WorldBlock, GeneralChunk, CHUNK_SIZE, TEST_BLOCKS } from './externalWorld';

export interface ChunkData {
    blocks: Uint8Array;
    blockLight: Uint8Array;
    skyLight: Uint8Array;
    position: { x: number; z: number };
}

// Extend GeneralChunk interface to include setBlock
interface ExtendedGeneralChunk extends GeneralChunk {
}

class DirectChunk implements ExtendedGeneralChunk {
    private blocks: Uint8Array;
    private blockLight: Uint8Array;
    private skyLight: Uint8Array;
    public position: { x: number; z: number };
    private worldHeight: number;
    private worldMinY: number;

    constructor(position: { x: number; z: number }, worldHeight: number, worldMinY: number) {
        this.position = position;
        this.worldHeight = worldHeight;
        this.worldMinY = worldMinY;
        const size = CHUNK_SIZE * CHUNK_SIZE * (worldHeight - worldMinY);
        this.blocks = new Uint8Array(size);
        this.blockLight = new Uint8Array(size);
        this.skyLight = new Uint8Array(size);
    }

    private getIndex(x: number, y: number, z: number): number {
        const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localY = y - this.worldMinY;
        return localX + localZ * CHUNK_SIZE + localY * CHUNK_SIZE * CHUNK_SIZE;
    }

    getBlock(x: number, y: number, z: number): WorldBlock | undefined {
        const index = this.getIndex(x, y, z);
        const blockId = this.blocks[index] ?? 0;
        return {
            id: blockId,
            isOpaque: blockId !== 0,
            isLightSource: false,
            lightEmission: 0
        };
    }

    setBlock(x: number, y: number, z: number, blockId: number): void {
        const index = this.getIndex(x, y, z);
        this.blocks[index] = blockId;
    }

    getBlockLight(x: number, y: number, z: number): number {
        const index = this.getIndex(x, y, z);
        return this.blockLight[index] ?? 0;
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        const index = this.getIndex(x, y, z);
        this.blockLight[index] = value;
    }

    getSunLight(x: number, y: number, z: number): number {
        const index = this.getIndex(x, y, z);
        return this.skyLight[index] ?? 0;
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
        const index = this.getIndex(x, y, z);
        this.skyLight[index] = value;
    }
}

export class LoadableWorld implements ExternalWorld {
    private chunks: Map<string, DirectChunk> = new Map();
    readonly WORLD_HEIGHT = 384;
    readonly WORLD_MIN_Y = -64;
    readonly SUPPORTS_SKY_LIGHT = true;

    constructor() {}

    private getChunkKey(x: number, z: number): string {
        return `${x},${z}`;
    }

    private getChunkAndLocalCoord(
        globalX: number,
        y: number,
        globalZ: number
    ): { chunk: DirectChunk | undefined; localX: number; localZ: number } {
        const chunkX = Math.floor(globalX / CHUNK_SIZE);
        const chunkZ = Math.floor(globalZ / CHUNK_SIZE);

        const localX = ((globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localZ = ((globalZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

        const chunk = this.getChunk(chunkX, chunkZ);
        return { chunk, localX, localZ };
    }

    // Thread-safe methods for loading chunk data
    public loadChunkData(data: ChunkData): void {
        const { position, blocks, blockLight, skyLight } = data;
        const chunk = new DirectChunk(position, this.WORLD_HEIGHT, this.WORLD_MIN_Y);

        // Copy data directly
        chunk['blocks'] = blocks;
        chunk['blockLight'] = blockLight;
        chunk['skyLight'] = skyLight;

        this.setChunk(position.x, position.z, chunk);
    }

    public unloadChunk(x: number, z: number): void {
        this.chunks.delete(this.getChunkKey(x, z));
    }

    // ExternalWorld interface implementation
    getBlock(x: number, y: number, z: number): WorldBlock | undefined {
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return TEST_BLOCKS.air;
        return chunk.getBlock(localX, y, localZ);
    }

    setBlock(x: number, y: number, z: number, blockId: number): void {
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return;
        chunk.setBlock(localX, y, localZ, blockId);
    }

    getChunk(x: number, z: number): DirectChunk | undefined {
        return this.chunks.get(this.getChunkKey(x, z));
    }

    hasChunk(x: number, z: number): boolean {
        return this.chunks.has(this.getChunkKey(x, z));
    }

    private setChunk(x: number, z: number, chunk: DirectChunk | undefined): void {
        if (chunk) {
            this.chunks.set(this.getChunkKey(x, z), chunk);
        } else {
            this.chunks.delete(this.getChunkKey(x, z));
        }
    }

    getBlockLight(x: number, y: number, z: number): number {
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return 0;
        return chunk.getBlockLight(localX, y, localZ);
    }

    setBlockLight(x: number, y: number, z: number, value: number): void {
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return;
        chunk.setBlockLight(localX, y, localZ, value);
    }

    getSunLight(x: number, y: number, z: number): number {
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return 0;
        return chunk.getSunLight(localX, y, localZ);
    }

    setSunLight(x: number, y: number, z: number, value: number): void {
        const { chunk, localX, localZ } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return;
        chunk.setSunLight(localX, y, localZ, value);
    }
}

export const extractIndexesFromWorld = (world: { getBlockStateId(pos: { x: number, y: number, z: number }): number }) => {
    const indexes: number[] = []
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                indexes.push(world.getBlockStateId({ x, y, z }))
            }
        }
    }
    return indexes
}

// Helper function to create a new LoadableWorld instance
export function createLoadableWorld(): LoadableWorld {
    return new LoadableWorld();
}
