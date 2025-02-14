import minecraftData from 'minecraft-data'
import { getSyncWorld } from '../src/world'
import { createLightEngineForSyncWorld } from '../src/prismarineShim'
import { Vec3 } from 'vec3'

const version = '1.20.4';
const syncWorld = getSyncWorld(version)
const data = minecraftData(version)

const main = async () => {
    syncWorld.setBlockStateId(new Vec3(1, 0, 0), data.blocksByName['glowstone']!.defaultState)

    const  lightWorld  = createLightEngineForSyncWorld(syncWorld, data)
    const affected = await lightWorld.receiveUpdateColumn(0, 0)
    console.log('affected', affected)
    console.log(lightWorld.getBlockLight(0, 0, 1))
    console.log(lightWorld.getPerformanceStats())
}

main()
