import { CHUNK_SIZE, MAX_LIGHT_LEVEL, TEST_BLOCKS, World } from '../src/engine'

export {}

// UI State
interface UIState {
    displaySize: number;
    blockSize: number;
    viewPlane: 'XZ' | 'ZY' | 'XY';
    slicePosition: number;
    lightType: 'blockLight' | 'skyLight';
    placeBlockType: 'glowstone' | 'stone' | 'water';
}

const loadStateFromURL = (): UIState => {
    const params = new URLSearchParams(window.location.search);
    return {
        displaySize: parseInt(params.get('displaySize') || '10'),
        blockSize: parseInt(params.get('blockSize') || '32'),
        viewPlane: (params.get('viewPlane') || 'XZ') as UIState['viewPlane'],
        slicePosition: parseInt(params.get('slicePosition') || '64'),
        lightType: (params.get('lightType') || 'blockLight') as UIState['lightType'],
        placeBlockType: (params.get('placeBlockType') || 'glowstone') as UIState['placeBlockType']
    };
};

const state: UIState = loadStateFromURL();

let world: World
const testCasePlain = () => {
    // Usage example:
    world = new World();
    globalThis.world = world

    // Load chunk when needed

    // Place a light source
    world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone.id);
    // world.setBlockLight(5, 64, 5, 15);

    // world.calculateInitialSunLight(chunk);
    world.receiveUpdateColumn(0, 0);
}

const testCaseSimple = () => {
    world = new World();

    world.setBlockLight(5, 64, 5, 15);

    world.propagateLight()
}

const testCase = () => {
    // testCaseSimple()
    testCasePlain()
}

const displayStats = () => {

    // Display performance stats
    const statsDiv = document.createElement('div');
    statsDiv.style.fontFamily = 'monospace';
    statsDiv.style.whiteSpace = 'pre';
    statsDiv.style.margin = '10px';
    container.appendChild(statsDiv);

    // Update stats periodically
    setInterval(() => {
        statsDiv.textContent = world.getPerformanceStats();
    }, 1000);
}

// UI Setup
const container = document.createElement('div')
document.body.appendChild(container)

const controls = document.createElement('div')
controls.style.marginBottom = '10px'
container.appendChild(controls)

// Size controls
const sizeLabel = document.createElement('label')
sizeLabel.textContent = 'Display Size: '
controls.appendChild(sizeLabel)

const sizeInput = document.createElement('input')
sizeInput.type = 'number'
sizeInput.value = state.displaySize.toString()
sizeInput.min = '1'
sizeInput.max = '32'
sizeInput.addEventListener('change', () => {
    state.displaySize = parseInt(sizeInput.value)
    canvas.width = state.displaySize * state.blockSize
    canvas.height = state.displaySize * state.blockSize
    updateURL()
    render()
})
controls.appendChild(sizeInput)

// Block size controls
const blockSizeLabel = document.createElement('label')
blockSizeLabel.textContent = ' Block Size: '
controls.appendChild(blockSizeLabel)

const blockSizeInput = document.createElement('input')
blockSizeInput.type = 'number'
blockSizeInput.value = state.blockSize.toString()
blockSizeInput.min = '16'
blockSizeInput.max = '64'
blockSizeInput.addEventListener('change', () => {
    state.blockSize = parseInt(blockSizeInput.value)
    canvas.width = state.displaySize * state.blockSize
    canvas.height = state.displaySize * state.blockSize
    updateURL()
    render()
})
controls.appendChild(blockSizeInput)

// Plane selector
const planeLabel = document.createElement('label')
planeLabel.textContent = ' View Plane: '
controls.appendChild(planeLabel)

const planeSelect = document.createElement('select')
const planes = ['XZ', 'ZY', 'XY']
planes.forEach(plane => {
    const option = document.createElement('option')
    option.value = plane
    option.textContent = plane
    planeSelect.appendChild(option)
})
planeSelect.value = state.viewPlane
planeSelect.addEventListener('change', () => {
    state.viewPlane = planeSelect.value as UIState['viewPlane']
    updateURL()
    render()
})
controls.appendChild(planeSelect)

// Slice position control
const sliceLabel = document.createElement('label')
sliceLabel.textContent = ' Slice Position: '
controls.appendChild(sliceLabel)

const sliceInput = document.createElement('input')
sliceInput.type = 'number'
sliceInput.value = state.slicePosition.toString()
sliceInput.min = '0'
sliceInput.max = '255'
sliceInput.addEventListener('change', () => {
    state.slicePosition = parseInt(sliceInput.value)
    updateURL()
    render()
})
controls.appendChild(sliceInput)

// After the slice position control, add light type selector
const lightTypeLabel = document.createElement('label')
lightTypeLabel.textContent = ' Light Type: '
controls.appendChild(lightTypeLabel)

const lightTypeSelect = document.createElement('select')
const lightTypes = [
    { value: 'blockLight', label: 'Block Light' },
    { value: 'skyLight', label: 'Sky Light' }
]
lightTypes.forEach(type => {
    const option = document.createElement('option')
    option.value = type.value
    option.textContent = type.label
    lightTypeSelect.appendChild(option)
})
lightTypeSelect.value = state.lightType
lightTypeSelect.addEventListener('change', () => {
    state.lightType = lightTypeSelect.value as UIState['lightType']
    updateURL()
    render()
})
controls.appendChild(lightTypeSelect)

// Add block type selector after light type selector
const blockTypeLabel = document.createElement('label');
blockTypeLabel.textContent = ' Place Block: ';
controls.appendChild(blockTypeLabel);

const blockTypeSelect = document.createElement('select');
const blockTypes = [
    { value: 'glowstone', label: 'Glowstone' },
    { value: 'stone', label: 'Stone' },
    { value: 'water', label: 'Water' }
];
blockTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type.value;
    option.textContent = type.label;
    blockTypeSelect.appendChild(option);
});
blockTypeSelect.value = state.placeBlockType;
blockTypeSelect.addEventListener('change', () => {
    state.placeBlockType = blockTypeSelect.value as UIState['placeBlockType'];
    updateURL();
});
controls.appendChild(blockTypeSelect);

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')!

canvas.width = state.displaySize * state.blockSize
canvas.height = state.displaySize * state.blockSize
container.appendChild(canvas)

const getCoordinatesForPlane = (x: number, y: number): [number, number, number] => {
    switch (state.viewPlane) {
        case 'XZ': return [x, state.slicePosition, y]
        case 'ZY': return [state.slicePosition, y, x]
        case 'XY': return [x, y, state.slicePosition]
    }
}

const updateURL = () => {
    const params = new URLSearchParams();
    Object.entries(state).forEach(([key, value]) => {
        params.set(key, value.toString());
    });
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
};

const render = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw grid
    ctx.strokeStyle = '#ccc'
    for (let x = 0; x <= state.displaySize; x++) {
        ctx.beginPath()
        ctx.moveTo(x * state.blockSize, 0)
        ctx.lineTo(x * state.blockSize, canvas.height)
        ctx.stroke()
    }
    for (let y = 0; y <= state.displaySize; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * state.blockSize)
        ctx.lineTo(canvas.width, y * state.blockSize)
        ctx.stroke()
    }

    // Draw chunk borders
    ctx.strokeStyle = '#ffff00'
    ctx.lineWidth = 2
    for (let x = 0; x <= state.displaySize; x += CHUNK_SIZE) {
        ctx.beginPath()
        ctx.moveTo(x * state.blockSize, 0)
        ctx.lineTo(x * state.blockSize, canvas.height)
        ctx.stroke()
    }
    for (let y = 0; y <= state.displaySize; y += CHUNK_SIZE) {
        ctx.beginPath()
        ctx.moveTo(0, y * state.blockSize)
        ctx.lineTo(canvas.width, y * state.blockSize)
        ctx.stroke()
    }
    ctx.lineWidth = 1

    // Draw blocks with light levels
    for (let x = 0; x < state.displaySize; x++) {
        for (let y = 0; y < state.displaySize; y++) {
            const [worldX, worldY, worldZ] = getCoordinatesForPlane(x, y)
            let lightLevel = state.lightType === 'blockLight'
                ? world.getBlockLight(worldX, worldY, worldZ)
                : world.getSunLight(worldX, worldY, worldZ)

            const brightness = Math.floor((lightLevel / MAX_LIGHT_LEVEL) * 255)

            // Use different colors for block light and sky light
            const color = state.lightType === 'blockLight'
                ? `rgb(${brightness},${Math.floor(brightness * 0.8)},${Math.floor(brightness * 0.6)})`  // Warm color for block light
                : `rgb(${Math.floor(brightness * 0.6)},${Math.floor(brightness * 0.8)},${brightness})`  // Cool color for sky light

            ctx.fillStyle = color
            ctx.fillRect(
                x * state.blockSize,
                y * state.blockSize,
                state.blockSize - 1,
                state.blockSize - 1
            )

            // Draw light level text
            ctx.fillStyle = brightness < 128 ? 'white' : 'black'
            ctx.font = '12px monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(
                lightLevel.toString(),
                x * state.blockSize + state.blockSize/2,
                y * state.blockSize + state.blockSize/2
            )

            // Add block type indicators
            const block = world.getBlock(worldX, worldY, worldZ);

            if (block && block.id !== TEST_BLOCKS.air.id) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 2;

                if (block.id === TEST_BLOCKS.glowstone.id) {
                    ctx.strokeStyle = 'yellow';
                } else if (block.id === TEST_BLOCKS.stone.id) {
                    ctx.strokeStyle = 'gray';
                } else if (block.id === TEST_BLOCKS.water.id) {
                    ctx.strokeStyle = 'blue';
                }

                ctx.strokeRect(
                    x * state.blockSize + 4,
                    y * state.blockSize + 4,
                    state.blockSize - 8,
                    state.blockSize - 8
                );
            }
        }
    }

    requestAnimationFrame(render)
}

displayStats()
testCase()

render()

// Add click handlers to canvas
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / state.blockSize);
    const y = Math.floor((e.clientY - rect.top) / state.blockSize);

    if (x < 0 || x >= state.displaySize || y < 0 || y >= state.displaySize) return;

    const [worldX, worldY, worldZ] = getCoordinatesForPlane(x, y);

    if (e.button === 0) { // Left click
        const blockId = TEST_BLOCKS[state.placeBlockType].id;
        world.setBlock(worldX, worldY, worldZ, blockId);
        if (state.placeBlockType === 'glowstone') {
            world.setBlockLight(worldX, worldY, worldZ, 15);
        }
    } else if (e.button === 2) { // Right click
        world.setBlock(worldX, worldY, worldZ, TEST_BLOCKS.air.id);
        world.setBlockLight(worldX, worldY, worldZ, 0);
    }

    world.propagateLight();
});

// Prevent context menu on right click
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
