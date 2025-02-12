export const CHUNK_SIZE = 16;
export const MAX_LIGHT_LEVEL = 15;

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
    chunk: GeneralChunk;
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
        isOpaque: true,
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

export interface GeneralChunk {
    position: ChunkPosition;
    getBlock(x: number, y: number, z: number): WorldBlock | undefined;
    getBlockLight(x: number, y: number, z: number): number;
    setBlockLight(x: number, y: number, z: number, value: number): void;
    getSunLight(x: number, y: number, z: number): number;
    setSunLight(x: number, y: number, z: number, value: number): void;
}

export class TestChunk implements GeneralChunk {
    public sections: Map<number, TestChunkSection>;
    public position: ChunkPosition;
    public isLoaded: boolean = false;
    private _debug_get_block_count = 0

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
        this._debug_get_block_count++
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

export interface ExternalWorld {
    WORLD_HEIGHT: number;
    WORLD_MIN_Y: number;
    SUPPORTS_SKY_LIGHT: boolean;

    getBlock(x: number, y: number, z: number): WorldBlock | undefined;
    setBlock(x: number, y: number, z: number, blockId: number): void;
    getHighestBlockInColumn?(chunk: GeneralChunk, x: number, z: number): number // use only if provided
    getChunk(x: number, z: number): GeneralChunk | undefined;
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
}
