import { Vec3 } from 'vec3';
import { LightWorld } from "./engine";
import { TEST_BLOCKS } from './externalWorld';
import { getPrismarineSyncWorld } from "./prismarineWorld";
import minecraftData from 'minecraft-data'
import { createLightEngineForSyncWorld } from './prismarineShim';

const version = '1.20.4';
const syncWorld = getPrismarineSyncWorld(version)
const data = minecraftData(version)

// TESTING Y = 64

export const testCases = {
    // check re-propagation of sunlight between chunks
    async sunlight_stone_up() {
        const lightWorld = createLightEngineForSyncWorld(syncWorld, data)
        // ceiling
        for (let x = -16; x < 16; x++) {
            for (let z = -16; z < 16; z++) {
                syncWorld.setBlockStateId(new Vec3(x, 84, z), data.blocksByName['stone']!.defaultState)
            }
        }
        // floor
        for (let x = -16; x < 16; x++) {
            for (let z = -16; z < 16; z++) {
                syncWorld.setBlockStateId(new Vec3(x, 63, z), data.blocksByName['stone']!.defaultState)
            }
        }

        await lightWorld.receiveUpdateColumn(0, 0)

        syncWorld.setBlockStateId(new Vec3(1, 84, 1), 0)
        const chunks = await lightWorld.receiveUpdateColumn(0, 0)
        return lightWorld
        // console.log(lightWorld.getSunLight(0, 1, 0))
        // console.log(lightWorld.getPerformanceStats())
    }
}

// testCases.sunlight_stone_up()
