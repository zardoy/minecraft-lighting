import { LightNode, LightRemovalNode, CHUNK_SIZE, MAX_LIGHT_LEVEL, WorldBlock, ExternalWorld, TestWorld, ChunkPosition, GeneralChunk, TEST_BLOCKS } from './externalWorld';
import { WorldLightHolder } from './worldLightHolder';

type ChunkUpdateType = {
    terminate(): void;
    column: ChunkPosition;
    priority: number;
    timestamp: number;
    updateType: 'block' | 'sun' | undefined;
};

export class LightWorld {
    public PARALLEL_CHUNK_PROCESSING = true

    // not necessarily needed for the engine to work, but useful for side cases
    public worldLightHolder: WorldLightHolder

    private sunLightQueue: LightNode[] = [];
    private blockLightQueue: LightNode[] = [];
    private lightRemovalQueue: LightRemovalNode[] = [];
    // private pendingCrossChunkLight: Map<string, LightNode[]> = new Map();
    private pendingLightUpdates: Map<string, ChunkUpdateType> = new Map();
    private isProcessingLight = false;
    public performanceStats: Map<string, { calls: number, totalTime: number }> = new Map();
    private affectedChunksTimestamps: Map<string, number> = new Map();
    public onChunkProcessed = [] as ((chunkX: number, chunkZ: number) => void)[];
    chunksProcessed = 0

    /* @memory */
    lastBlockUpdates = {} as Record<string, Map<string, number>>

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
        // TODO optimise!
        this.setBlockChunkAffected(x, y, z);
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
        const id = performance.now()
        performance.mark(`${name}-${id}-start`);
        return () => {
            this.markEnd(name, id)
        }
    }

    private markEnd(name: string, id: number) {
        performance.mark(`${name}-${id}-end`);
        performance.measure(name, `${name}-${id}-start`, `${name}-${id}-end`);

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
        performance.clearMarks(`${name}-${id}-start`);
        performance.clearMarks(`${name}-${id}-end`);
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

    async setBlockUpdateChunkIfNeeded(x: number, y: number, z: number) {
        const { chunk } = this.getChunkAndLocalCoord(x, y, z);
        if (!chunk) return;
        const block = this.getBlock(x, y, z);
        const blockLight = this.getBlockLight(x, y, z);
        const sunLight = this.getSunLight(x, y, z);

        const blockKey = `${x},${y},${z}`;
        const chunkKey = this.getChunkKey(chunk.position.x, chunk.position.z);
        if (!this.lastBlockUpdates[chunkKey]) {
            this.lastBlockUpdates[chunkKey] = new Map<string, number>();
        }
        const chunkBlockUpdates = this.lastBlockUpdates[chunkKey]
        if (chunkBlockUpdates.get(blockKey) === block?.id) {
            return
        }
        chunkBlockUpdates.set(blockKey, block?.id ?? 0);

        let updateSunLight = false;
        let updateBlockLight = false;

        const filtersLight = (block?.filterLight ?? 0) > 0;
        // Check if block affects sunlight
        if (block?.isOpaque || filtersLight) {
            // Check if this block was previously letting sunlight through
            if (sunLight > 0) {
                updateSunLight = true;
            }
        } else if (sunLight === 0) {
            // If block is not opaque and there's no sunlight, check if it should let sunlight through
            // if sunlight has above or sideways
            if (this.getSunLight(x, y + 1, z) > 2) {
                updateSunLight = true;
            }

            if (this.getSunLight(x + 1, y, z) > 2 || this.getSunLight(x - 1, y, z) > 2 || this.getSunLight(x, y, z + 1) > 2 || this.getSunLight(x, y, z - 1) > 2) {
                updateSunLight = true;
            }
        }

        // Check if block affects block light
        if (block?.isLightSource) {
            updateBlockLight = true;
        } else if (block?.isOpaque || filtersLight) {
            // Check if this block was previously letting block light through
            if (blockLight > 0) {
                updateBlockLight = true;
            } else {
                // Check if this block is blocking light from any direction
                for (const dir of LightWorld.DIRECTIONS) {
                    const nx = x + dir.x;
                    const ny = y + dir.y;
                    const nz = z + dir.z;
                    if (ny < this.WORLD_MIN_Y || ny >= this.WORLD_HEIGHT) continue;
                    if (this.getBlockLight(nx, ny, nz) > 0) {
                        updateBlockLight = true;
                        break;
                    }
                }
            }
        }

        if (!updateSunLight && !updateBlockLight) {
            return;
        }

        // Determine which type of light update to perform
        let updateType: 'block' | 'sun' | undefined;
        if (updateSunLight && updateBlockLight) {
            updateType = undefined; // Update both
        } else if (updateSunLight) {
            updateType = 'sun';
        } else if (updateBlockLight) {
            updateType = 'block';
        }

        const start = performance.now();
        const afffected = await this.receiveUpdateColumn(chunk.position.x, chunk.position.z, updateType)
        const end = performance.now();
        return {
            chunk,
            updateType,
            affectedChunks: afffected,
            time: end - start
        }
    }

    setBlockLegacy(x: number, y: number, z: number, block: WorldBlock, autoPropagate = true): void {
        const oldBlock = this.getBlock(x, y, z);
        const oldBlockLight = this.getBlockLight(x, y, z);
        const oldSunLight = this.getSunLight(x, y, z);

        // Step 1: Store the light levels of surrounding blocks before removal
        type LightNode = { x: number; y: number; z: number; level: number };
        const surroundingBlocksLight: LightNode[] = [];
        const surroundingSunLight: LightNode[] = [];

        for (const dir of LightWorld.DIRECTIONS) {
            const nx = x + dir.x;
            const ny = y + dir.y;
            const nz = z + dir.z;

            // Skip if Y is out of bounds
            if (ny < this.WORLD_MIN_Y || ny >= this.WORLD_HEIGHT) {
                continue;
            }

            surroundingBlocksLight.push({
                x: nx, y: ny, z: nz,
                level: this.getBlockLight(nx, ny, nz)
            });

            surroundingSunLight.push({
                x: nx, y: ny, z: nz,
                level: this.getSunLight(nx, ny, nz)
            });
        }

        // Step 2: If the old block had any light, we need to remove it first
        if (oldBlockLight > 0) {
            this.removeBlockLight(x, y, z);
        }
        if (oldSunLight > 0) {
            this.removeSunLight(x, y, z);
        }

        // Run light removal propagation first
        if (this.lightRemovalQueue.length > 0) {
            // this.unPropagateLight();
        }

        // Step 3: Set the new block
        this.externalWorld.setBlock(x, y, z, block.id);

        // Step 4: If the new block is a light source, add its light
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

        // Step 5: Handle opacity changes affecting sunlight
        if (block.isOpaque) {
            this.updateSunLightRemove(x, y, z);
        } else {
            this.updateSunLightAdd(x, y, z);
        }

        // Step 6: Check all surrounding blocks that had light and add them back to the queue
        // This ensures proper re-propagation around the changed block
        for (const lightNode of surroundingBlocksLight) {
            const currentLight = this.getBlockLight(lightNode.x, lightNode.y, lightNode.z);
            if (currentLight > 0) {
                const { chunk, localX, localZ } = this.getChunkAndLocalCoord(
                    lightNode.x, lightNode.y, lightNode.z
                );
                if (chunk) {
                    this.blockLightQueue.push({
                        x: localX,
                        y: lightNode.y,
                        z: localZ,
                        chunk
                    });
                }
            }
        }

        for (const lightNode of surroundingSunLight) {
            const currentLight = this.getSunLight(lightNode.x, lightNode.y, lightNode.z);
            if (currentLight > 0) {
                const { chunk, localX, localZ } = this.getChunkAndLocalCoord(
                    lightNode.x, lightNode.y, lightNode.z
                );
                if (chunk) {
                    this.sunLightQueue.push({
                        x: localX,
                        y: lightNode.y,
                        z: localZ,
                        chunk
                    });
                }
            }
        }

        if (autoPropagate) {
            // Step 7: Propagate light changes in the correct order
            // Process block light
            if (this.blockLightQueue.length > 0) {
                this.propagateBlockLight();
            }

            // Process sun light after block light
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
            chunk,
            isSunLight: true
        });

        // Set the light to 0
        this.setSunLight(x, y, z, 0);
    }

    private unPropagateLight(): void {
        while (this.lightRemovalQueue.length > 0) {
            const node = this.lightRemovalQueue.shift()!;
            const { x, y, z, value: lightLevel, chunk } = node;

            // Determine if this is a sun light or block light removal node
            // This is a critical fix - the original method was always checking for block light
            const isSunLight = node.isSunLight ?? (chunk.getSunLight(x, y, z) === 0 && lightLevel > 0);

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

                // Check the appropriate light type
                const neighborLight = isSunLight
                    ? targetChunk.getSunLight(targetX, newY, targetZ)
                    : targetChunk.getBlockLight(targetX, newY, targetZ);

                // If the neighbor's light is coming from the removed light source
                if (neighborLight !== 0 && neighborLight < lightLevel) {
                    if (isSunLight) {
                        this.removeSunLight(globalX, newY, globalZ);
                    } else {
                        this.removeBlockLight(globalX, newY, globalZ, neighborLight);
                    }
                }
                // If the neighbor has equal or greater light level, it might be from another source
                else if (neighborLight >= lightLevel) {
                    if (isSunLight) {
                        this.sunLightQueue.push({
                            x: targetX,
                            y: newY,
                            z: targetZ,
                            chunk: targetChunk
                        });
                    } else {
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

        // Critical improvement: Check all horizontal and diagonal neighbors
        // This handles cases where light might need to flow back into areas
        // that were previously lit by the column we just blocked
        const directions = [
            { x: -1, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: 0, y: 0, z: -1 },
            { x: 0, y: 0, z: 1 },
            { x: -1, y: 0, z: -1 },
            { x: -1, y: 0, z: 1 },
            { x: 1, y: 0, z: -1 },
            { x: 1, y: 0, z: 1 },
        ];

        // Check horizontal neighbors on the same level
        for (const dir of directions) {
            const nx = x + dir.x;
            const nz = z + dir.z;

            // Check if the neighbor has sunlight
            const neighborLight = this.getSunLight(nx, y, nz);

            if (neighborLight > 0) {
                const { chunk, localX, localZ } = this.getChunkAndLocalCoord(nx, y, nz);
                if (chunk) {
                    // Add this neighbor to the propagation queue to ensure its light spreads properly
                    this.sunLightQueue.push({
                        x: localX,
                        y,
                        z: localZ,
                        chunk
                    });
                }
            }
        }

        // Also check neighbors above and below to ensure light flows properly in 3D
        // This is especially important for re-propagating after block placement
        for (let dy = -1; dy <= 1; dy++) {
            if (dy === 0) continue; // Skip same level (already handled)

            const ny = y + dy;
            if (ny < this.WORLD_MIN_Y || ny >= this.WORLD_HEIGHT) continue;

            for (const dir of directions) {
                const nx = x + dir.x;
                const nz = z + dir.z;

                const neighborLight = this.getSunLight(nx, ny, nz);
                if (neighborLight > 0) {
                    const { chunk, localX, localZ } = this.getChunkAndLocalCoord(nx, ny, nz);
                    if (chunk) {
                        this.sunLightQueue.push({
                            x: localX,
                            y: ny,
                            z: localZ,
                            chunk
                        });
                    }
                }
            }
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
        const end = this.markStart('propagateSunLight')

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
            // Skip if there's no light to propagate
            if (lightLevel <= 0) continue;

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

                // Skip propagation into opaque blocks
                if (targetBlock?.isOpaque) continue;

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

                // Only propagate if new light level would be higher than current
                if (currentLight < newLight) {
                    targetChunk.setSunLight(targetX, newY, targetZ, newLight);

                    // Mark this chunk as affected for rendering updates
                    this.setBlockChunkAffected(globalX, newY, globalZ);

                    this.sunLightQueue.push({
                        x: targetX,
                        y: newY,
                        z: targetZ,
                        chunk: targetChunk
                    });
                }
            }
        }

        end()
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
        const end = this.markStart('propagateLight')
        this.propagateGeneric(
            this.blockLightQueue,
            (chunk, x, y, z) => chunk.getBlockLight(x, y, z),
            (chunk, x, y, z, value) => chunk.setBlockLight(x, y, z, value),
            this.filterLight
        );
        end()
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

    async receiveUpdateColumn(x: number, z: number, updateType?: 'block' | 'sun'): Promise<ChunkPosition[] | null> {
        this.affectedChunksTimestamps.clear();
        const chunk = this.externalWorld.getChunk(x, z)!;
        if (!chunk) {
            throw new Error(`Chunk ${x},${z} not loaded yet`);
        }

        // Set start time for this light operation
        const currentLightOperationStart = Date.now();

        // Add update to Map with timestamp
        const key = this.getChunkKey(x, z);
        const update: ChunkUpdateType = {
            column: { x, z },
            priority: 1,
            timestamp: Date.now(),
            terminate: () => { },
            updateType: updateType
        };
        const currentUpdate = this.pendingLightUpdates.get(key);
        if (currentUpdate) {
            currentUpdate.terminate();
        }
        this.pendingLightUpdates.set(key, update);

        const promise = this.processLightQueue();
        await promise;
        // if (!this.isProcessingLight) {
        //     if (!this.PARALLEL_CHUNK_PROCESSING) {
        //         await promise;
        //     }
        // }

        // disable process termination for now
        // const res = await new Promise<boolean>(resolve => {
        //     update.terminate = () => {
        //         resolve(false);
        //     }
        //     const checkComplete = () => {
        //         if (!this.pendingLightUpdates.has(key)) {
        //             resolve(true);
        //         } else {
        //             setTimeout(checkComplete, 10);
        //         }
        //     };
        //     checkComplete();
        // })
        // if (!res) return null;

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
        const end = this.markStart('processLightQueue')
        this.isProcessingLight = true;

        try {
            // Convert Map to array and sort by priority/timestamp if needed
            const currentUpdates = Array.from(this.pendingLightUpdates.entries());

            for (const [key, update] of currentUpdates) {
                // Check if this update has been superseded
                const currentUpdate = this.pendingLightUpdates.get(key);
                if (!currentUpdate || currentUpdate.timestamp !== update.timestamp) {
                    // Skip this update as a newer one exists
                    continue;
                }

                const { column, updateType } = update;
                const chunk = this.externalWorld.getChunk(column.x, column.z);
                if (!chunk) continue;

                // Process light based on updateType
                if (updateType === 'block' || updateType === undefined) {
                    await this.processTorchlightForChunk(chunk);
                }
                if (updateType === 'sun' || updateType === undefined) {
                    await this.processSunlightForChunk(chunk);
                }

                // Remove this update only if it hasn't been superseded
                if (this.pendingLightUpdates.get(key)?.timestamp === update.timestamp) {
                    this.pendingLightUpdates.delete(key);
                }

                await new Promise(resolve => setTimeout(resolve, 0));
                this.chunksProcessed++
            }
        } finally {
            this.isProcessingLight = false;
            end()
        }
    }

    // Update this method to only process torch light sources
    private async processTorchlightForChunk(chunk: GeneralChunk): Promise<void> {
        const end = this.markStart('processTorchlightForChunk')

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

        end()
    }

    private async processSunlightForChunk(chunk: GeneralChunk): Promise<void> {
        if (!this.externalWorld.SUPPORTS_SKY_LIGHT) {
            return;
        }

        const end = this.markStart('processSunlightForChunk')

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

        end()
    }

    private addPendingLight(x: number, y: number, z: number, sourceChunk: GeneralChunk): void {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const key = this.getChunkKey(chunkX, chunkZ);

        // If the target chunk isn't loaded, queue a light update for when it does load
        if (!this.pendingLightUpdates.has(key)) {
            this.pendingLightUpdates.set(key, {
                column: { x: chunkX, z: chunkZ },
                priority: 2, // Higher priority for cross-chunk propagation
                timestamp: Date.now(),
                terminate: () => { },
                updateType: undefined
            });
        }

        // Try to get the neighboring chunk again - it might have loaded
        const { chunk: targetChunk } = this.getChunkAndLocalCoord(x, y, z);
        if (targetChunk) {
            const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
            const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

            // Calculate the original source position in global coords
            // Get the ACTUAL light level from the source position
            const sourceX = sourceChunk.position.x * CHUNK_SIZE +
                Math.floor((sourceChunk.position.x * CHUNK_SIZE + CHUNK_SIZE - 1 - x) >= CHUNK_SIZE ?
                    CHUNK_SIZE - 1 : (sourceChunk.position.x * CHUNK_SIZE + CHUNK_SIZE - 1 - x));
            const sourceZ = sourceChunk.position.z * CHUNK_SIZE +
                Math.floor((sourceChunk.position.z * CHUNK_SIZE + CHUNK_SIZE - 1 - z) >= CHUNK_SIZE ?
                    CHUNK_SIZE - 1 : (sourceChunk.position.z * CHUNK_SIZE + CHUNK_SIZE - 1 - z));

            // Use the adjacent block from the source chunk to determine light value
            const adjacentX = x - (x > sourceChunk.position.x * CHUNK_SIZE ? 1 : -1);
            const adjacentZ = z - (z > sourceChunk.position.z * CHUNK_SIZE ? 1 : -1);

            // Check if there's skylight at the edge of the source chunk
            const sunLight = this.getSunLight(adjacentX, y, adjacentZ);
            if (sunLight > 0) {
                // Add to the sun light queue with one level less
                const newSunLight = Math.max(0, sunLight - 1);
                if (newSunLight > 0) {
                    // Set the light directly
                    this.setSunLight(x, y, z, newSunLight);

                    // Add to queue for further propagation
                    this.sunLightQueue.push({
                        x: localX,
                        y,
                        z: localZ,
                        chunk: targetChunk
                    });
                }
            }

            // Do the same for block light
            const blockLight = this.getBlockLight(adjacentX, y, adjacentZ);
            if (blockLight > 0) {
                const newBlockLight = Math.max(0, blockLight - 1);
                if (newBlockLight > 0) {
                    this.setBlockLight(x, y, z, newBlockLight);

                    this.blockLightQueue.push({
                        x: localX,
                        y,
                        z: localZ,
                        chunk: targetChunk
                    });
                }
            }
        }
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
        delete this.lastBlockUpdates[key]
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
