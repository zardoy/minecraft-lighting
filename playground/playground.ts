import { CHUNK_SIZE, MAX_LIGHT_LEVEL, TEST_BLOCKS, LightWorld } from '../src/engine'

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

// Add after UIState interface
interface UIControl<T> {
    type: 'number' | 'select';
    label: string;
    key: keyof UIState;
    value: T;
    options?: { value: T, label: string }[];
    min?: number;
    max?: number;
}

const controls: UIControl<any>[] = [
    {
        type: 'number',
        label: 'Display Size',
        key: 'displaySize',
        value: 10,
        min: 1,
        max: 32
    },
    {
        type: 'number',
        label: 'Block Size',
        key: 'blockSize',
        value: 32,
        min: 16,
        max: 64
    },
    {
        type: 'select',
        label: 'View Plane',
        key: 'viewPlane',
        value: 'XZ',
        options: [
            { value: 'XZ', label: 'XZ' },
            { value: 'ZY', label: 'ZY' },
            { value: 'XY', label: 'XY' }
        ]
    },
    {
        type: 'number',
        label: 'Slice Position',
        key: 'slicePosition',
        value: 64,
        min: 0,
        max: 255
    },
    {
        type: 'select',
        label: 'Light Type',
        key: 'lightType',
        value: 'blockLight',
        options: [
            { value: 'blockLight', label: 'Block Light' },
            { value: 'skyLight', label: 'Sky Light' }
        ]
    },
    {
        type: 'select',
        label: 'Place Block',
        key: 'placeBlockType',
        value: 'glowstone',
        options: [
            { value: 'glowstone', label: 'Glowstone' },
            { value: 'stone', label: 'Stone' },
            { value: 'water', label: 'Water' }
        ]
    }
];

const loadStateFromURL = (): UIState => {
    const params = new URLSearchParams(window.location.search);
    return controls.reduce((state, control) => {
        const value = params.get(control.key);
        if (value === null) return { ...state, [control.key]: control.value };

        return {
            ...state,
            [control.key]: control.type === 'number' ? parseInt(value) : value
        };
    }, {} as UIState);
};

const state: UIState = loadStateFromURL();

let world: LightWorld
const testCasePlain = () => {
    // Usage example:
    world = new LightWorld();
    globalThis.world = world

    // Load chunk when needed

    // Place a light source
    world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone);
    world.setBlock(5, 64, 5, TEST_BLOCKS.stone);
    // world.setBlockLight(5, 64, 5, 15);

    // world.calculateInitialSunLight(chunk);
    world.receiveUpdateColumn(0, 0);
}

const testCaseSimple = () => {
    world = new LightWorld();

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
    }, 500);
}

// UI Setup
const container = document.createElement('div')
document.body.appendChild(container)

const controlsContainer = document.createElement('div')
controlsContainer.style.marginBottom = '10px'
container.appendChild(controlsContainer)

// Replace UI controls creation with this
const createControls = () => {
    controls.forEach(control => {
        const label = document.createElement('label');
        label.textContent = ` ${control.label}: `;
        container.appendChild(label);

        if (control.type === 'number') {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = state[control.key].toString();
            input.min = control.min?.toString() || '0';
            input.max = control.max?.toString() || '255';
            input.addEventListener('change', () => {
                //@ts-ignore
                state[control.key] = parseInt(input.value);
                if (control.key === 'displaySize' || control.key === 'blockSize') {
                    canvas.width = state.displaySize * state.blockSize;
                    canvas.height = state.displaySize * state.blockSize;
                }
                updateURL();
                render();
            });
            container.appendChild(input);
        } else if (control.type === 'select') {
            const select = document.createElement('select');
            control.options?.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                select.appendChild(opt);
            });
            select.value = state[control.key].toString();
            select.addEventListener('change', () => {
                //@ts-ignore
                state[control.key] = select.value
                updateURL();
                render();
            });
            container.appendChild(select);
        }
    });
};

createControls()

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

// Add this helper function
const updateBlockAndLight = (x: number, y: number, z: number, blockId: number | null) => {
    const oldBlock = world.getBlock(x, y, z);
    const oldBlockLight = world.getBlockLight(x, y, z);
    const oldSunLight = world.getSunLight(x, y, z);

    if (blockId === null) {
        // Removing block
        if (oldBlock?.isLightSource) {
            // If removing a light source, we need to remove its light first
            world.setBlockLight(x, y, z, 0);
            world.propagateLight();
        }
        world.setBlock(x, y, z, TEST_BLOCKS.air);
    } else {
        // Adding new block
        const newBlock = TEST_BLOCKS[blockId === TEST_BLOCKS.glowstone.id ? 'glowstone' :
                                  blockId === TEST_BLOCKS.stone.id ? 'stone' : 'water'];

        // If placing an opaque block where there was light, remove the light first

        world.setBlock(x, y, z, newBlock);
    }
};

// Update the click handler to use the new function
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / state.blockSize);
    const y = Math.floor((e.clientY - rect.top) / state.blockSize);

    if (x < 0 || x >= state.displaySize || y < 0 || y >= state.displaySize) return;

    const [worldX, worldY, worldZ] = getCoordinatesForPlane(x, y);

    if (e.button === 0) { // Left click
        const blockId = TEST_BLOCKS[state.placeBlockType].id;
        updateBlockAndLight(worldX, worldY, worldZ, blockId);
    } else if (e.button === 2) { // Right click
        updateBlockAndLight(worldX, worldY, worldZ, null);
    }
});

// Prevent context menu on right click
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
