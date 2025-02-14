import { ExternalWorld } from './externalWorld';

export const fillColumnWithZeroLight = (world: ExternalWorld, startX: number, startZ: number) => {
    for (let x = startX; x < startX + 16; x++) {
        for (let z = startZ; z < startZ + 16; z++) {
            for (let y = world.WORLD_MIN_Y; y < world.WORLD_HEIGHT; y++) {
                world.setBlockLight(x, y, z, 0)
            }
        }
    }
}
