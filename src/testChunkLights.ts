import MinecraftData from 'minecraft-data'
import ChunkLoader from 'prismarine-chunk'
import { Vec3 } from 'vec3'

const versions = [
    '1.8',
    '1.9',
    '1.13',
    '1.14',
    '1.15',
    '1.16',
    '1.17',
    '1.18',
]

for (const version of versions) {
    const mcData = MinecraftData(version)
    const Chunk = (ChunkLoader as any)(version)
    const chunk = new Chunk()
    const getLightValue = (x: number, y: number, z: number) => {
        const val = Math.floor((x + z) / 2)
        if (val > 15) throw new Error('val > 15')
        return val
    }

    for (let y = chunk.minY; y < chunk.minY + (chunk.worldHeight ?? 256); y++) {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                chunk.setBlockLight(new Vec3(x, y, z), getLightValue(x, y, z))
            }
        }
    }

    const chunk2 = new Chunk()
    chunk2.loadLightNew(chunk.dumpLightNew())
    for (let y = chunk.minY; y < chunk.minY + (chunk.worldHeight ?? 256); y++) {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const val = chunk.getBlockLight(new Vec3(x, y, z))
                if (val !== getLightValue(x, y, z)) {
                    console.log(version, x, y, z, val, getLightValue(x, y, z))
                }
            }
        }
    }
}
