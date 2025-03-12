import { Vec3 } from 'vec3';
import { LightWorld } from "./engine";
import { TEST_BLOCKS } from './externalWorld';
import { getPrismarineSyncWorld } from "./prismarineWorld";
import minecraftData from 'minecraft-data'
import { createLightEngineForSyncWorld } from './prismarineShim';

const version = '1.20.4';
const syncWorld = getPrismarineSyncWorld(version)
const data = minecraftData(version)

export const testCases = {
    async sunlight_stone_up() {
        const lightWorld = createLightEngineForSyncWorld(syncWorld, data)
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                syncWorld.setBlockStateId(new Vec3(x, 0, z), data.blocksByName['stone']!.defaultState)
            }
        }
        syncWorld.setBlockStateId(new Vec3(0, 5, 0), data.blocksByName['stone']!.defaultState)
        await lightWorld.receiveUpdateColumn(0, 0)
        console.log(lightWorld.getSunLight(0, 1, 0))
        // console.log(lightWorld.getPerformanceStats())
    }
}

testCases.sunlight_stone_up()
