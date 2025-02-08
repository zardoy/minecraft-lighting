import { CHUNK_SIZE, TEST_BLOCKS, World } from '../../minecraft-lighting/src/engine'
import { performance, PerformanceObserver } from 'perf_hooks';

const world = new World();
globalThis.world = world;

const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach(entry => {
        const stats = world.performanceStats.get(entry.name) || { calls: 0, totalTime: 0 };
        stats.calls++;
        stats.totalTime += entry.duration;
        world.performanceStats.set(entry.name, stats);
    });
});
observer.observe({ entryTypes: ['measure'] })

const chunkMidPlatform = () => {
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            world.setBlock(x, 64, z, TEST_BLOCKS.stone.id);
        }
    }
}

const main = () => {

    // Place a light source
    chunkMidPlatform()
    // world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone.id);

    // Process the chunk
    world.receiveUpdateColumn(0, 0);
    console.log(world.getBlockLight(5, 64, 5))
    console.log(world.getSunLight(5, 64, 5))
    console.log(globalThis._debug_get_block_count)
}

main();

// // Print performance stats periodically
// setInterval(() => {
//     console.clear(); // Clear console for better readability
//     console.log(world.getPerformanceStats());
// }, 1000);

// // Add some test blocks to see light propagation
// setTimeout(() => {
//     // Add some blocks around the light source
//     world.setBlock(5, 63, 5, TEST_BLOCKS.stone.id); // Below
//     world.setBlock(6, 64, 5, TEST_BLOCKS.glass.id); // Side
//     world.setBlock(5, 64, 6, TEST_BLOCKS.water.id); // Side

//     // Process updates
//     world.receiveUpdateColumn(0, 0, chunk);
// }, 2000);

// // Keep the process running
// process.stdin.resume();
