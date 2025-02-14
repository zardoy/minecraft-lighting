import { world } from 'prismarine-world'
import { Vec3 } from 'vec3'
import { LightWorld } from './engine'
import { WorldBlock, ExternalWorld } from './externalWorld'

interface WorldOptions {
    height?: number
    minY?: number
    enableSkyLight?: boolean
}

export const convertPrismarineBlockToWorldBlock = (block: any, mcData: any): WorldBlock => {
    const blockData = mcData.blocks[block.type]
    let emitLight = blockData.emitLight;
    // todo
    if (block.name === 'redstone_ore') {
        emitLight = 0;
    }
    return {
        id: block.type,
        isOpaque: !block.transparent,
        isLightSource: emitLight > 0,
        lightEmission: emitLight ?? 0,
        filterLight: blockData.filterLight ?? 1,
    }
}

export const createLightEngineForSyncWorld = (world: world.WorldSync, mcData: any, options: WorldOptions = {}) => {
    const externalWorld: ExternalWorld = {
        SUPPORTS_SKY_LIGHT: options.enableSkyLight ?? true,
        WORLD_HEIGHT: options.height ?? 256,
        WORLD_MIN_Y: options.minY ?? -64,
        getBlock(x, y, z) {
            const block = world.getBlock(new Vec3(x, y, z))
            if (!block) return undefined
            return convertPrismarineBlockToWorldBlock(block, mcData)
        },
        setBlock(x, y, z, blockId) {
            throw new Error('Not implemented')
        },
        getChunk(x, z) {
            const chunk = world.getColumn(x, z)
            if (!chunk) return undefined
            return {
                position: { x, z },
                getBlock: (x, y, z) => {
                    const block = world.getBlock(new Vec3(x, y, z))
                    if (!block) return undefined
                    return convertPrismarineBlockToWorldBlock(block, mcData)
                },
                getBlockLight(x, y, z) {
                    return world.getBlockLight(new Vec3(x, y, z))
                },
                setBlockLight(x, y, z, value) {
                    world.setBlockLight(new Vec3(x, y, z), value)
                },
                getSunLight(x, y, z) {
                    return world.getSkyLight(new Vec3(x, y, z))
                },
                setSunLight(x, y, z, value) {
                    world.setSkyLight(new Vec3(x, y, z), value)
                },
            }
        },
        getBlockLight(x, y, z) {
            return world.getBlockLight(new Vec3(x, y, z))
        },
        setBlockLight(x, y, z, value) {
            world.setBlockLight(new Vec3(x, y, z), value)
        },
        getSunLight(x, y, z) {
            return world.getSkyLight(new Vec3(x, y, z))
        },
        setSunLight(x, y, z, value) {
            world.setSkyLight(new Vec3(x, y, z), value)
        },
        hasChunk(x, z) {
            return !!world.getColumn(x, z)
        },
    }
    return new LightWorld(externalWorld)
}
