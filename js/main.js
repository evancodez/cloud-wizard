import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Main game class
class CloudWizard {
    constructor() {
        // Initialize game properties
        this.plants = [];
        this.clouds = [];
        this.wildPlants = []; // Add initialization for wildPlants array
        this.isCreatingCloud = false;
        this.currentCloud = null;
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.groundIntersectPoint = new THREE.Vector3();
        
        // Day/night cycle properties
        this.timeOfDay = 0; // 0 to 1 representing time of day
        this.dayLength = 180; // seconds for a full day
        this.daySpeed = 1 / this.dayLength;
        this.sunPosition = new THREE.Vector3();
        
        // Game state and scoring
        this.plantsRevived = 0;
        this.magicPower = 1000; // Power resource for creating clouds
        this.magicRegenRate = 0.1; // Magic regeneration per frame
        
        // Audio management
        this.audioEnabled = true;
        this.setupAudio();
        
        // Keyboard movement controls
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            space: false,
            shift: false
        };
        this.movementSpeed = 0.5;
        this.verticalSpeed = 0.3;
        
        // Setup Three.js scene
        this.setupScene();
        this.setupLights();
        this.createSkybox();
        this.createGround();
        this.createPlants();
        this.createEnvironment();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Start game loop
        this.animate();
        
        // Hide loading screen
        document.getElementById('loading').style.display = 'none';
    }
    
    setupScene() {
        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('canvas'),
            antialias: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB);
        this.renderer.shadowMap.enabled = true;
        
        // Setup scene
        this.scene = new THREE.Scene();
        
        // Setup camera
        this.camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.camera.position.set(0, 20, 40); // Increased from (0, 10, 20) to be more zoomed out
        
        // Setup camera controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 80; // Increased from 50 to allow more zooming out
        this.controls.maxPolarAngle = Math.PI / 2.1; // Prevent going below ground
        this.controls.target.set(0, 5, 0); // Adjusted target to look at a higher point
    }
    
    setupLights() {
        // Ambient light - will change with time of day
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(this.ambientLight);
        
        // Directional light (sun) - will change position and color with time of day
        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.sunLight.position.set(10, 20, 10);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 50;
        this.sunLight.shadow.camera.left = -20;
        this.sunLight.shadow.camera.right = 20;
        this.sunLight.shadow.camera.top = 20;
        this.sunLight.shadow.camera.bottom = -20;
        this.scene.add(this.sunLight);
        
        // Moon light - only visible at night
        this.moonLight = new THREE.DirectionalLight(0x8080ff, 0.2);
        this.moonLight.position.set(-10, 20, -10);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 1024;
        this.moonLight.shadow.mapSize.height = 1024;
        this.moonLight.shadow.camera.near = 0.5;
        this.moonLight.shadow.camera.far = 50;
        this.moonLight.shadow.camera.left = -20;
        this.moonLight.shadow.camera.right = 20;
        this.moonLight.shadow.camera.top = 20;
        this.moonLight.shadow.camera.bottom = -20;
        this.moonLight.intensity = 0; // Start with no moonlight
        this.scene.add(this.moonLight);
    }
    
    createSkybox() {
        // Create a gradient skybox using a custom shader
        const vertexShader = `
            varying vec3 vWorldPosition;
            
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        const fragmentShader = `
            uniform vec3 topColor;
            uniform vec3 middleColor;
            uniform vec3 bottomColor;
            uniform float timeOfDay; // 0 to 1 representing time of day
            varying vec3 vWorldPosition;
            
            // Day sky colors
            vec3 dayTopColor = vec3(0.4, 0.6, 0.9);     // Bright blue
            vec3 dayMiddleColor = vec3(0.7, 0.8, 0.95);  // Light blue
            vec3 dayBottomColor = vec3(0.9, 0.9, 1.0);  // Very light blue/white
            
            // Sunset/sunrise colors
            vec3 sunsetTopColor = vec3(0.1, 0.2, 0.5);     // Dark blue
            vec3 sunsetMiddleColor = vec3(0.8, 0.5, 0.2);  // Orange
            vec3 sunsetBottomColor = vec3(0.9, 0.6, 0.2);  // Light orange
            
            // Night sky colors
            vec3 nightTopColor = vec3(0.0, 0.0, 0.1);    // Very dark blue
            vec3 nightMiddleColor = vec3(0.1, 0.1, 0.2);  // Dark blue
            vec3 nightBottomColor = vec3(0.05, 0.05, 0.1);  // Nearly black
            
            // Find colors based on time of day
            vec3 getColorForTime(vec3 dayColor, vec3 sunsetColor, vec3 nightColor) {
                // Sunrise: 0.2-0.3, Daytime: 0.3-0.7, Sunset: 0.7-0.8, Nighttime: 0.8-0.2
                if (timeOfDay < 0.2) {
                    // Night to sunrise transition
                    float t = timeOfDay / 0.2;
                    return mix(nightColor, sunsetColor, t);
                } else if (timeOfDay < 0.3) {
                    // Sunrise to day transition
                    float t = (timeOfDay - 0.2) / 0.1;
                    return mix(sunsetColor, dayColor, t);
                } else if (timeOfDay < 0.7) {
                    // Daytime
                    return dayColor;
                } else if (timeOfDay < 0.8) {
                    // Day to sunset transition
                    float t = (timeOfDay - 0.7) / 0.1;
                    return mix(dayColor, sunsetColor, t);
                } else {
                    // Sunset to night transition
                    float t = (timeOfDay - 0.8) / 0.2;
                    return mix(sunsetColor, nightColor, t);
                }
            }
            
            void main() {
                float h = normalize(vWorldPosition).y;
                
                // Get current colors based on time of day
                vec3 currentTopColor = getColorForTime(dayTopColor, sunsetTopColor, nightTopColor);
                vec3 currentMiddleColor = getColorForTime(dayMiddleColor, sunsetMiddleColor, nightMiddleColor);
                vec3 currentBottomColor = getColorForTime(dayBottomColor, sunsetBottomColor, nightBottomColor);
                
                // Blend based on height
                vec3 skyColor;
                if (h > 0.2) {
                    skyColor = mix(currentMiddleColor, currentTopColor, (h - 0.2) / 0.8);
                } else {
                    skyColor = mix(currentBottomColor, currentMiddleColor, h / 0.2);
                }
                
                gl_FragColor = vec4(skyColor, 1.0);
            }
        `;
        
        this.skyUniforms = {
            topColor: { value: new THREE.Color(0x9CB4E8) },     // Light blue
            middleColor: { value: new THREE.Color(0xE0B1CB) },  // Light pink
            bottomColor: { value: new THREE.Color(0xBEB5E8) },  // Light purple
            timeOfDay: { value: this.timeOfDay }                // Time of day
        };
        
        const skyGeo = new THREE.SphereGeometry(400, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.skyUniforms,
            side: THREE.BackSide,
            depthWrite: false
        });
        
        this.sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.sky);
        
        // Add stars (only visible at night)
        this.createStars();
    }
    
    createStars() {
        // Create star particles
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1,
            transparent: true,
            opacity: 0, // Start with invisible stars
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        // Create random star positions
        const starsCount = 2000;
        const positions = new Float32Array(starsCount * 3);
        
        for (let i = 0; i < starsCount; i++) {
            const i3 = i * 3;
            // Generate points on a sphere
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 350; // Just inside the skybox
            
            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);
        }
        
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.stars);
    }
    
    createGround() {
        // Create a grassy ground plane
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x7CFC00, // Grass green
            side: THREE.DoubleSide 
        });
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);
        
        // Add a decorative pastel border around the ground
        this.createPastelBorder();
    }
    
    createPastelBorder() {
        // Create a larger decorative border plane below the ground
        const borderSize = 300; // Much larger than the ground
        const borderGeometry = new THREE.PlaneGeometry(borderSize, borderSize);
        
        // Create a custom shader material for pastel flowy pattern
        const borderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                groundSize: { value: 50.0 }, // Half the ground size
                color1: { value: new THREE.Color(0xFFBFD5) }, // Pastel pink
                color2: { value: new THREE.Color(0xBFE9FF) }, // Pastel blue
                color3: { value: new THREE.Color(0xBFFFD5) }, // Pastel green
                color4: { value: new THREE.Color(0xE9BFFF) }  // Pastel purple
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float groundSize;
                uniform vec3 color1;
                uniform vec3 color2;
                uniform vec3 color3;
                uniform vec3 color4;
                varying vec2 vUv;
                
                // Simple noise function
                float noise(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }
                
                void main() {
                    // Transform UV to world coordinates
                    vec2 pos = (vUv - 0.5) * 300.0;
                    float dist = length(pos);
                    
                    // Create transition between ground and border
                    float groundEdge = groundSize;
                    float borderFade = smoothstep(groundEdge - 5.0, groundEdge + 15.0, dist);
                    
                    // Create flowing pastel pattern
                    float angle = atan(pos.y, pos.x);
                    float wave = sin(dist * 0.05 - time * 0.5) * 0.5 + 0.5;
                    float wave2 = cos(angle * 3.0 + time * 0.2) * 0.5 + 0.5;
                    float wave3 = sin(dist * 0.02 + angle * 2.0 - time * 0.3) * 0.5 + 0.5;
                    
                    // Mix colors based on waves
                    vec3 col1 = mix(color1, color2, wave);
                    vec3 col2 = mix(color3, color4, wave2);
                    vec3 finalColor = mix(col1, col2, wave3);
                    
                    // Ensure transparency inside the ground area and fade at the border
                    if (dist < groundEdge - 5.0) {
                        discard; // Transparent inside ground
                    }
                    
                    gl_FragColor = vec4(finalColor, borderFade * 0.7); // Semi-transparent
                }
            `,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.rotation.x = -Math.PI / 2;
        border.position.y = -0.1; // Slightly below the ground
        this.scene.add(border);
        
        // Store material to update time in animation loop
        this.borderMaterial = borderMaterial;
    }
    
    createEnvironment() {
        // Add trees, bushes, and wild plants to create a richer environment
        this.createTrees();
        this.createDecorationBushes();
        this.createWildPlants();
        this.createRocks();
    }
    
    createTrees() {
        // Create 5-8 trees at the edges of the playable area
        const numTrees = 5 + Math.floor(Math.random() * 4);
        
        for (let i = 0; i < numTrees; i++) {
            const tree = this.createTree();
            
            // Position trees around the edges of the area
            let x, z;
            const distanceFromCenter = 30 + Math.random() * 15; // 30-45 units from center
            const angle = (i / numTrees) * Math.PI * 2 + Math.random() * 0.5;
            
            x = Math.cos(angle) * distanceFromCenter;
            z = Math.sin(angle) * distanceFromCenter;
            
            tree.position.set(x, 0, z);
            
            // Random scale
            const scale = 0.9 + Math.random() * 0.4;
            tree.scale.set(scale, scale + Math.random() * 0.3, scale);
            
            // Random rotation
            tree.rotation.y = Math.random() * Math.PI * 2;
            
            this.scene.add(tree);
        }
    }
    
    createTree() {
        const treeGroup = new THREE.Group();
        
        // Trunk
        const trunkHeight = 4 + Math.random() * 2;
        const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.6, trunkHeight, 8, 2);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);
        
        // Tree canopy (multiple layers)
        const canopyLayers = 2 + Math.floor(Math.random() * 2);
        const canopyColors = [
            0x228B22, // Forest Green
            0x006400, // Dark Green
            0x2E8B57, // Sea Green
            0x3CB371, // Medium Sea Green
        ];
        
        for (let i = 0; i < canopyLayers; i++) {
            const y = trunkHeight - 1 + i * 1.5;
            const radius = 2 - i * 0.3;
            const geometry = new THREE.SphereGeometry(radius, 8, 8);
            const color = canopyColors[Math.floor(Math.random() * canopyColors.length)];
            const material = new THREE.MeshLambertMaterial({ color: color });
            const canopy = new THREE.Mesh(geometry, material);
            
            canopy.position.y = y;
            canopy.castShadow = true;
            treeGroup.add(canopy);
        }
        
        return treeGroup;
    }
    
    createDecorationBushes() {
        // Create 8-12 bushes scattered around the environment
        const numBushes = 8 + Math.floor(Math.random() * 5);
        
        for (let i = 0; i < numBushes; i++) {
            const bush = this.createDecorationBush();
            
            // Position bushes randomly, avoiding the center
            let x, z;
            const minDistance = 10; // Minimum distance from center
            const maxDistance = 25; // Maximum distance from center
            
            do {
                x = (Math.random() * 2 - 1) * maxDistance;
                z = (Math.random() * 2 - 1) * maxDistance;
            } while (Math.sqrt(x * x + z * z) < minDistance);
            
            bush.position.set(x, 0, z);
            
            // Random scale
            const scale = 0.7 + Math.random() * 0.6;
            bush.scale.set(scale, scale, scale);
            
            // Random rotation
            bush.rotation.y = Math.random() * Math.PI * 2;
            
            this.scene.add(bush);
        }
    }
    
    createDecorationBush() {
        const bushGroup = new THREE.Group();
        
        // Base
        const baseGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.5, 8, 1);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.25;
        base.castShadow = true;
        bushGroup.add(base);
        
        // Leaf colors
        const leafColors = [
            0x228B22, // Forest Green
            0x32CD32, // Lime Green
            0x006400, // Dark Green
            0x556B2F, // Olive Green
        ];
        
        // Create 3-5 main clusters
        const numClusters = 3 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numClusters; i++) {
            const clusterGeometry = new THREE.SphereGeometry(0.6 + Math.random() * 0.4, 8, 6);
            const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
            const clusterMaterial = new THREE.MeshLambertMaterial({ color: leafColor });
            const cluster = new THREE.Mesh(clusterGeometry, clusterMaterial);
            
            // Position clusters to form an overall bush shape
            const radius = 0.3 + Math.random() * 0.2;
            const angle = (i / numClusters) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = 0.6 + Math.random() * 0.4;
            
            cluster.position.set(x, y, z);
            cluster.castShadow = true;
            bushGroup.add(cluster);
            
            // Add some smaller sub-clusters
            const subClusters = Math.floor(Math.random() * 3);
            for (let j = 0; j < subClusters; j++) {
                const subRadius = 0.3 + Math.random() * 0.2;
                const subAngle = Math.random() * Math.PI * 2;
                const subX = x + Math.cos(subAngle) * 0.3;
                const subZ = z + Math.sin(subAngle) * 0.3;
                const subY = y + 0.2 + Math.random() * 0.3;
                
                const subGeometry = new THREE.SphereGeometry(subRadius, 6, 6);
                const subMaterial = new THREE.MeshLambertMaterial({ color: leafColor });
                const subCluster = new THREE.Mesh(subGeometry, subMaterial);
                
                subCluster.position.set(subX, subY, subZ);
                subCluster.castShadow = true;
                bushGroup.add(subCluster);
            }
        }
        
        // Add some small flowers (20% chance)
        if (Math.random() < 0.2) {
            const numFlowers = 2 + Math.floor(Math.random() * 3);
            const flowerColors = [0xFF0000, 0xFFFF00, 0xFFFFFF, 0xFF69B4];
            
            for (let i = 0; i < numFlowers; i++) {
                const flowerSize = 0.1 + Math.random() * 0.1;
                const flowerGeometry = new THREE.DodecahedronGeometry(flowerSize, 0);
                const flowerColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
                const flowerMaterial = new THREE.MeshLambertMaterial({ color: flowerColor });
                const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
                
                // Position flower on top of a random cluster
                const angle = Math.random() * Math.PI * 2;
                flower.position.set(
                    Math.cos(angle) * 0.5,
                    1.0 + Math.random() * 0.5,
                    Math.sin(angle) * 0.5
                );
                
                flower.castShadow = true;
                bushGroup.add(flower);
            }
        }
        
        return bushGroup;
    }
    
    createWildPlants() {
        // Create 80-120 wild plants (flowers, grass tufts, etc.) - significantly increased from 60-90
        const numWildPlants = 80 + Math.floor(Math.random() * 41);
        
        // Define the safe area for plant spawning (ground is 100x100)
        const safeRadius = 45; // Ensure plants stay within the ground
        
        for (let i = 0; i < numWildPlants; i++) {
            // Determine plant type with modified probabilities for more variety
            const plantType = Math.random();
            let wildPlant;
            
            if (plantType < 0.25) {
                // Wild flower (25%)
                wildPlant = this.createWildFlower();
            } else if (plantType < 0.5) {
                // Grass tuft (25%)
                wildPlant = this.createGrassTuft();
            } else if (plantType < 0.7) {
                // Mushroom (20%)
                wildPlant = this.createMushroom();
            } else if (plantType < 0.85) {
                // Small ivy patch (15%)
                wildPlant = this.createSmallIvy();
            } else {
                // New: mixed plant clusters (15%)
                wildPlant = this.createMixedPlantCluster();
            }
            
            // Position randomly across the ground, ensuring they stay within bounds
            let distance, angle, x, z;
            
            // Use rejection sampling to ensure plants stay within the safe radius
            do {
                distance = Math.random() * safeRadius;
                angle = Math.random() * Math.PI * 2;
                x = Math.cos(angle) * distance;
                z = Math.sin(angle) * distance;
            } while (Math.sqrt(x * x + z * z) > safeRadius);
            
            wildPlant.position.set(x, 0, z);
            
            // More varied scaling (0.4 to 2.0 times original size)
            const scale = 0.4 + Math.random() * 1.6;
            wildPlant.scale.set(scale, scale, scale);
            
            // Random rotation
            wildPlant.rotation.y = Math.random() * Math.PI * 2;
            
            this.scene.add(wildPlant);
            this.wildPlants.push(wildPlant);
        }
    }
    
    createMixedPlantCluster() {
        const cluster = new THREE.Group();
        
        // Create 2-5 plants in a small area
        const numPlantsInCluster = 2 + Math.floor(Math.random() * 4);
        
        for (let i = 0; i < numPlantsInCluster; i++) {
            // Choose a random plant type
            const randomPlant = Math.random();
            let plant;
            
            if (randomPlant < 0.3) {
                plant = this.createWildFlower();
            } else if (randomPlant < 0.6) {
                plant = this.createGrassTuft();
            } else if (randomPlant < 0.85) {
                plant = this.createMushroom();
            } else {
                plant = this.createSmallIvy();
            }
            
            // Position in a tight cluster
            const radius = 0.2 + Math.random() * 0.5;
            const angle = Math.random() * Math.PI * 2;
            plant.position.set(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );
            
            // Varied scale within the cluster
            const scale = 0.5 + Math.random() * 0.7;
            plant.scale.set(scale, scale, scale);
            
            // Random rotation
            plant.rotation.y = Math.random() * Math.PI * 2;
            
            cluster.add(plant);
        }
        
        return cluster;
    }
    
    createWildFlower() {
        const flowerGroup = new THREE.Group();
        
        // Stem
        const stemHeight = 0.5 + Math.random() * 0.5;
        const stemGeometry = new THREE.CylinderGeometry(0.03, 0.05, stemHeight, 5, 1);
        const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // Green
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = stemHeight / 2;
        stem.castShadow = true;
        flowerGroup.add(stem);
        
        // Flower
        const flowerColors = [
            0xFF0000, // Red
            0xFFFF00, // Yellow
            0xFFFFFF, // White
            0xFF69B4, // Pink
            0x800080, // Purple
            0xFFA500, // Orange
            0x0000FF, // Blue
        ];
        
        const flowerColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        
        // Randomize flower type
        const flowerType = Math.floor(Math.random() * 3);
        let flowerGeometry;
        
        if (flowerType === 0) {
            // Simple flower (sphere)
            flowerGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        } else if (flowerType === 1) {
            // Daisy-like (flattened sphere)
            flowerGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        } else {
            // Unique shape
            flowerGeometry = new THREE.DodecahedronGeometry(0.15, 0);
        }
        
        const flowerMaterial = new THREE.MeshLambertMaterial({ color: flowerColor });
        const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
        flower.position.y = stemHeight;
        
        // If daisy-like, flatten it
        if (flowerType === 1) {
            flower.scale.y = 0.4;
        }
        
        flower.castShadow = true;
        flowerGroup.add(flower);
        
        return flowerGroup;
    }
    
    createGrassTuft() {
        const grassGroup = new THREE.Group();
        
        // Create 8-16 individual grass blades (increased from 7-12)
        const numBlades = 8 + Math.floor(Math.random() * 9);
        
        // Expanded grass color variations
        const grassColors = [
            0x7CFC00, // Lawn Green
            0x32CD32, // Lime Green
            0x228B22, // Forest Green
            0x008000, // Green
            0x556B2F, // Dark Olive Green
            0x6B8E23, // Olive Drab
            0x8FBC8F, // Dark Sea Green
            0x9ACD32, // Yellow Green
        ];
        
        // Determine if this is tall grass or normal
        const isTallGrass = Math.random() < 0.3; // 30% chance for tall grass
        
        for (let i = 0; i < numBlades; i++) {
            // Height and width with variations based on grass type
            const height = isTallGrass ? 
                0.7 + Math.random() * 0.6 : // Tall grass
                0.4 + Math.random() * 0.4;  // Normal grass
            const width = 0.05 + Math.random() * 0.03;
            
            const bladeGeometry = new THREE.PlaneGeometry(width, height);
            const grassColor = grassColors[Math.floor(Math.random() * grassColors.length)];
            const bladeMaterial = new THREE.MeshLambertMaterial({ 
                color: grassColor,
                side: THREE.DoubleSide
            });
            
            const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
            
            // Position in a circle with more randomness
            const angle = (i / numBlades) * Math.PI * 2 + Math.random() * 0.7;
            const radius = 0.15 * Math.random(); // Slightly wider radius
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            blade.position.set(x, height / 2, z);
            
            // Rotate to face outward and add more natural bend
            blade.rotation.y = angle;
            blade.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.4; // More varied bend
            
            // Add some sideways bend for more realism
            blade.rotation.z = (Math.random() - 0.5) * 0.3;
            
            blade.castShadow = true;
            grassGroup.add(blade);
        }
        
        return grassGroup;
    }
    
    createMushroom() {
        const mushroomGroup = new THREE.Group();
        
        // Stem
        const stemHeight = 0.2 + Math.random() * 0.3; // Increased height variation
        const stemThickness = 0.04 + Math.random() * 0.06; // Added thickness variation
        const stemGeometry = new THREE.CylinderGeometry(stemThickness, stemThickness * 1.2, stemHeight, 6, 1);
        
        // Random stem colors
        const stemColors = [
            0xFFFFE0, // Light yellow
            0xFAF0E6, // Linen
            0xF5F5DC, // Beige
            0xFFF0F5, // LavenderBlush
        ];
        const stemColor = stemColors[Math.floor(Math.random() * stemColors.length)];
        const stemMaterial = new THREE.MeshLambertMaterial({ color: stemColor });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = stemHeight / 2;
        stem.castShadow = true;
        mushroomGroup.add(stem);
        
        // Determine mushroom type
        const mushroomType = Math.random();
        
        if (mushroomType < 0.7) { // 70% chance for normal cap mushrooms
        // Cap
            const capRadius = 0.15 + Math.random() * 0.15; // Increased size variation
        const capGeometry = new THREE.SphereGeometry(capRadius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        
            // Expanded mushroom colors
        const capColors = [
            0xFF0000, // Red
            0xA52A2A, // Brown
            0x8B4513, // Saddle Brown
            0xFFFFFF, // White
            0xFFFF00, // Yellow
                0xFF6347, // Tomato
                0x800000, // Maroon
                0xCD853F, // Peru
                0xDEB887, // BurlyWood
                0xD2691E, // Chocolate
                0xADFF2F, // GreenYellow (for some exotic mushrooms)
                0x708090, // SlateGray (for some unusual mushrooms)
        ];
        
        const capColor = capColors[Math.floor(Math.random() * capColors.length)];
        const capMaterial = new THREE.MeshLambertMaterial({ color: capColor });
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.position.y = stemHeight;
        cap.castShadow = true;
        mushroomGroup.add(cap);
        
            // Add spots to more mushrooms (50% chance, up from 30%)
            if (Math.random() < 0.5) {
                const numSpots = 3 + Math.floor(Math.random() * 7); // More spots
                
                // Spot colors based on cap colors
                let spotColor;
                if (capColor === 0xFFFFFF) {
                    // Dark spots on white caps
                    spotColor = 0x8B4513;
                } else {
                    // Usually white spots, but sometimes yellow
                    spotColor = Math.random() < 0.8 ? 0xFFFFFF : 0xFFFF00;
                }
            
            for (let i = 0; i < numSpots; i++) {
                    const spotSize = 0.02 + Math.random() * 0.03; // Larger spots
                const spotGeometry = new THREE.CircleGeometry(spotSize, 6);
                const spotMaterial = new THREE.MeshBasicMaterial({ color: spotColor });
                const spot = new THREE.Mesh(spotGeometry, spotMaterial);
                
                // Position on cap
                const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * capRadius * 0.8;
                
                spot.position.set(
                    Math.cos(angle) * radius,
                    stemHeight + 0.01,
                    Math.sin(angle) * radius
                );
                
                    // Rotate to face outward
                spot.rotation.x = -Math.PI / 2;
                
                mushroomGroup.add(spot);
            }
        }
        } else if (mushroomType < 0.9) { // 20% chance for flat cap mushrooms
            // Flat cap
            const capRadius = 0.2 + Math.random() * 0.2;
            const capHeight = 0.05 + Math.random() * 0.05;
            const capGeometry = new THREE.CylinderGeometry(capRadius, capRadius, capHeight, 8, 1);
            
            const capColors = [
                0x8B4513, // SaddleBrown
                0xD2691E, // Chocolate
                0xCD853F, // Peru
                0xDEB887, // BurlyWood
                0xBC8F8F  // RosyBrown
            ];
            
            const capColor = capColors[Math.floor(Math.random() * capColors.length)];
            const capMaterial = new THREE.MeshLambertMaterial({ color: capColor });
            const cap = new THREE.Mesh(capGeometry, capMaterial);
            cap.position.y = stemHeight + capHeight/2;
            cap.castShadow = true;
            mushroomGroup.add(cap);
            
            // Add gills under flat cap
            const gillsRadius = capRadius * 0.95;
            const gillsGeometry = new THREE.CylinderGeometry(gillsRadius * 0.9, gillsRadius, capHeight * 0.5, 8, 1, true);
            const gillsMaterial = new THREE.MeshLambertMaterial({ 
                color: 0xE8E8E8, 
                side: THREE.DoubleSide 
            });
            const gills = new THREE.Mesh(gillsGeometry, gillsMaterial);
            gills.position.y = stemHeight + capHeight * 0.25;
            mushroomGroup.add(gills);
        } else { // 10% chance for puffball mushrooms
            // Puffball - round cap
            const puffballRadius = 0.15 + Math.random() * 0.15;
            const puffballGeometry = new THREE.SphereGeometry(puffballRadius, 8, 8);
            
            const puffballColors = [
                0xFFFFFF, // White
                0xFFFAF0, // FloralWhite
                0xFFFAFA, // Snow
                0xF5F5F5, // WhiteSmoke
                0xF0F8FF  // AliceBlue
            ];
            
            const puffballColor = puffballColors[Math.floor(Math.random() * puffballColors.length)];
            const puffballMaterial = new THREE.MeshLambertMaterial({ color: puffballColor });
            const puffball = new THREE.Mesh(puffballGeometry, puffballMaterial);
            puffball.position.y = stemHeight - stemHeight * 0.3; // Lower position
            puffball.scale.y = 0.9; // Slightly squashed
            puffball.castShadow = true;
            mushroomGroup.add(puffball);
            
            // Add some texture dots
            const numDots = 5 + Math.floor(Math.random() * 10);
            for (let i = 0; i < numDots; i++) {
                const dotSize = 0.01 + Math.random() * 0.01;
                const dotGeometry = new THREE.SphereGeometry(dotSize, 4, 4);
                const dotMaterial = new THREE.MeshBasicMaterial({ 
                    color: 0xE6E6E6 
                });
                const dot = new THREE.Mesh(dotGeometry, dotMaterial);
                
                // Position on surface of puffball
                const theta = Math.random() * Math.PI;
                const phi = Math.random() * Math.PI * 2;
                dot.position.set(
                    Math.sin(theta) * Math.cos(phi) * puffballRadius,
                    stemHeight - stemHeight * 0.3 + Math.sin(theta) * Math.sin(phi) * puffballRadius,
                    Math.cos(theta) * puffballRadius
                );
                
                mushroomGroup.add(dot);
            }
        }
        
        return mushroomGroup;
    }
    
    createSmallIvy() {
        // Create a small ivy patch
        const ivyGroup = new THREE.Group();
        
        // Base/ground attachment
        const baseRadius = 0.15 + Math.random() * 0.1;
        const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.2, 0.1, 5, 1);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.05;
        base.castShadow = true;
        ivyGroup.add(base);
        
        // Ivy colors - much more vibrant greens
        const ivyColors = [
            0x228B22, // Forest Green
            0x32CD32, // Lime Green
            0x00FF00, // Bright Green
            0x7CFC00, // Lawn Green
            0x00FA9A, // Medium Spring Green
        ];
        
        // Create main stems
        const numStems = 3 + Math.floor(Math.random() * 4); // 3-6 stems
        
        for (let i = 0; i < numStems; i++) {
            const stemLength = 0.6 + Math.random() * 1.0; // 0.6-1.6 units
            const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, stemLength, 4, 3, true);
            const stemColor = ivyColors[Math.floor(Math.random() * ivyColors.length)];
            const stemMaterial = new THREE.MeshLambertMaterial({ 
                color: stemColor,
                transparent: true,
                opacity: 0.9
            });
            const stem = new THREE.Mesh(stemGeometry, stemMaterial);
            
            // Position and orient stem
            const angle = (i / numStems) * Math.PI * 2 + Math.random() * 0.3;
            const distance = 0.1 + Math.random() * 0.1;
            
            stem.position.set(
                Math.cos(angle) * distance,
                stemLength / 2 * 0.5, // Half height, lower to ground
                Math.sin(angle) * distance
            );
            
            // Bend stem to look like it's growing along the ground
            stem.rotation.x = Math.PI / 2 - (Math.random() * 0.3); // Mostly horizontal
            stem.rotation.y = angle;
            
            stem.castShadow = true;
            ivyGroup.add(stem);
            
            // Add leaves to each stem
            const numLeaves = 4 + Math.floor(Math.random() * 5); // 4-8 leaves per stem
            
            for (let j = 0; j < numLeaves; j++) {
                // Create leaf with more complex shape - ivy-like
                const leafSize = 0.1 + Math.random() * 0.15;
                const leafShape = new THREE.Shape();
                
                // Heart-shaped leaf for ivy
                leafShape.moveTo(0, leafSize);
                leafShape.bezierCurveTo(leafSize/2, leafSize, leafSize, leafSize/2, leafSize, 0);
                leafShape.bezierCurveTo(leafSize, -leafSize/2, leafSize/2, -leafSize, 0, -leafSize);
                leafShape.bezierCurveTo(-leafSize/2, -leafSize, -leafSize, -leafSize/2, -leafSize, 0);
                leafShape.bezierCurveTo(-leafSize, leafSize/2, -leafSize/2, leafSize, 0, leafSize);
                
                const leafGeometry = new THREE.ShapeGeometry(leafShape);
                
                // Vary leaf color slightly from stem
                const colorVariation = Math.random() * 0.2 - 0.1; // -0.1 to 0.1
                const leafColor = new THREE.Color(stemColor);
                leafColor.r = Math.max(0, Math.min(1, leafColor.r + colorVariation));
                leafColor.g = Math.max(0, Math.min(1, leafColor.g + colorVariation));
                leafColor.b = Math.max(0, Math.min(1, leafColor.b + colorVariation));
                
                const leafMaterial = new THREE.MeshLambertMaterial({ 
                    color: leafColor,
                    side: THREE.DoubleSide
                });
                
                const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                
                // Position leaf along stem
                const leafPosition = (j / numLeaves) * 0.9; // Distribute along 90% of stem
                const stemVector = new THREE.Vector3(
                    Math.cos(angle) * (stemLength * leafPosition),
                    0,
                    Math.sin(angle) * (stemLength * leafPosition)
                );
                
                leaf.position.copy(stemVector);
                leaf.position.y = 0.05; // Just above ground
                
                // Random leaf orientation
                leaf.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.5; // Mostly facing up
                leaf.rotation.y = Math.random() * Math.PI * 2;
                leaf.rotation.z = Math.random() * Math.PI * 2;
                
                leaf.castShadow = true;
                ivyGroup.add(leaf);
            }
        }
        
        return ivyGroup;
    }
    
    createWiltedIvyPlant() {
        // Create a wilted climbing ivy plant
        const ivyGroup = new THREE.Group();
        
        // Base/root - darker, more shriveled
        const baseRadius = 0.1 + Math.random() * 0.1;
        const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.3, 0.15, 5, 1);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x4B3621 }); // Dark brown
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.075;
        base.castShadow = true;
        ivyGroup.add(base);
        
        // Main wilted vine/stem - gray colors to appear wilted
        const stemColors = [
            0x696969, // Dim Gray
            0x808080, // Gray
            0x778899, // Light Slate Gray
            0x5F9EA0, // Cadet Blue (slightly greenish gray)
        ];
        
        // Create climbing vine structure
        const numVines = 2 + Math.floor(Math.random() * 3); // 2-4 main vines
        
        for (let i = 0; i < numVines; i++) {
            // More elaborate vine with segments
            const vineHeight = 1.0 + Math.random() * 1.5; // 1.0-2.5 units
            const numSegments = 3 + Math.floor(Math.random() * 4); // 3-6 segments
            const segmentHeight = vineHeight / numSegments;
            
            const stemColor = stemColors[Math.floor(Math.random() * stemColors.length)];
            
            // Base angle for this vine
            const baseAngle = (i / numVines) * Math.PI * 2;
            
            // Create vine segments with curves
            let prevX = Math.cos(baseAngle) * 0.1;
            let prevZ = Math.sin(baseAngle) * 0.1;
            let prevY = 0.1; // Start slightly above ground
            
            for (let j = 0; j < numSegments; j++) {
                const segmentGeometry = new THREE.CylinderGeometry(0.03, 0.04, segmentHeight, 4, 1);
                const segmentMaterial = new THREE.MeshLambertMaterial({ color: stemColor });
                const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
                
                // Create a curved path for the vine
                const bendAngle = baseAngle + (Math.random() - 0.5) * 0.5;
                const bendDistance = 0.1 + (j * 0.05);
                
                const x = prevX + Math.cos(bendAngle) * bendDistance;
                const z = prevZ + Math.sin(bendAngle) * bendDistance;
                const y = prevY + segmentHeight / 2;
                
                segment.position.set(x, y, z);
                
                // Wilt/droop effect - more pronounced in upper segments
                const droopFactor = j / numSegments; // 0 to nearly 1
                segment.rotation.x = droopFactor * 0.8; // Increasing droop up the vine
                segment.rotation.z = (Math.random() - 0.5) * 0.4; // Random sideways tilt
                segment.rotation.y = bendAngle;
                
                segment.castShadow = true;
                ivyGroup.add(segment);
                
                // Save end position for next segment
                prevX = x;
                prevZ = z;
                prevY = y + segmentHeight / 2;
                
                // Add wilted leaves to each segment
                const numLeaves = 2 + Math.floor(Math.random() * 3); // 2-4 leaves per segment
                
                for (let k = 0; k < numLeaves; k++) {
                    // Create shriveled leaf
                    const leafSize = 0.1 + Math.random() * 0.1;
                    const leafShape = new THREE.Shape();
                    
                    // Shriveled heart-shaped leaf for ivy
                    leafShape.moveTo(0, leafSize);
                    leafShape.bezierCurveTo(leafSize*0.4, leafSize*0.7, leafSize*0.7, leafSize*0.4, leafSize*0.8, 0);
                    leafShape.bezierCurveTo(leafSize*0.7, -leafSize*0.4, leafSize*0.4, -leafSize*0.7, 0, -leafSize*0.8);
                    leafShape.bezierCurveTo(-leafSize*0.4, -leafSize*0.7, -leafSize*0.7, -leafSize*0.4, -leafSize*0.8, 0);
                    leafShape.bezierCurveTo(-leafSize*0.7, leafSize*0.4, -leafSize*0.4, leafSize*0.7, 0, leafSize);
                    
                    const leafGeometry = new THREE.ShapeGeometry(leafShape);
                    
                    // Gray, wilted leaf colors
                    const grayVariation = Math.random() * 0.3; // 0 to 0.3
                    const leafColor = new THREE.Color(
                        0.4 + grayVariation,
                        0.4 + grayVariation,
                        0.4 + grayVariation
                    );
                    
                    const leafMaterial = new THREE.MeshLambertMaterial({ 
                        color: leafColor,
                        side: THREE.DoubleSide
                    });
                    
                    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                    
                    // Position leaf along segment
                    const leafAngle = Math.random() * Math.PI * 2;
                    const leafDistance = 0.05 + Math.random() * 0.05;
                    const leafHeight = (k / numLeaves) * segmentHeight * 0.8;
                    
                    leaf.position.set(
                        x + Math.cos(leafAngle) * leafDistance,
                        y - segmentHeight/2 + leafHeight,
                        z + Math.sin(leafAngle) * leafDistance
                    );
                    
                    // Wilt effect on leaves - curl and droop
                    leaf.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.7; // Mostly downward
                    leaf.rotation.y = Math.random() * Math.PI * 2;
                    leaf.rotation.z = Math.random() * Math.PI * 2;
                    
                    // Shrivel effect - uneven scale
                    leaf.scale.x = 0.8 + Math.random() * 0.3;
                    leaf.scale.y = 0.6 + Math.random() * 0.3;
                    
                    leaf.castShadow = true;
                    ivyGroup.add(leaf);
                }
            }
        }
        
        return ivyGroup;
    }
    
    createRocks() {
        // Create 5-10 decorative rocks
        const numRocks = 5 + Math.floor(Math.random() * 6);
        
        for (let i = 0; i < numRocks; i++) {
            const rock = this.createRock();
            
            // Position randomly, avoiding center
            const distance = 8 + Math.random() * 32; // 8-40 units from center
            const angle = Math.random() * Math.PI * 2;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            
            rock.position.set(x, 0, z);
            
            // Random scale
            const scale = 0.7 + Math.random() * 1.3;
            rock.scale.set(scale, scale * 0.7, scale);
            
            // Random rotation
            rock.rotation.y = Math.random() * Math.PI * 2;
            
            this.scene.add(rock);
        }
    }
    
    createCloud() {
        const cloudGroup = new THREE.Group();
        
        // Create 5-8 spheres clustered together to form a fluffy cloud
        const numPuffs = 5 + Math.floor(Math.random() * 4);
        
        for (let i = 0; i < numPuffs; i++) {
            const puffSize = 0.5 + Math.random() * 0.7;
            const puffGeometry = new THREE.SphereGeometry(puffSize, 7, 7);
            const puffMaterial = new THREE.MeshLambertMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9
            });
            
            const puff = new THREE.Mesh(puffGeometry, puffMaterial);
            
            // Position each puff randomly to form a cloud shape
            const x = (Math.random() - 0.5) * 2;
            const y = (Math.random() - 0.5) * 1;
            const z = (Math.random() - 0.5) * 2;
            
            puff.position.set(x, y, z);
            puff.castShadow = true;
            cloudGroup.add(puff);
        }
        
        // Add cloud to scene at the given position
        const cloud = {
            mesh: cloudGroup,
            rainCount: 0,
            isRaining: false,
            rainParticles: [],
            targetPlant: null,
            creationTime: Date.now(),
            dissolveState: 0
        };
        
        return cloud;
    }
    
    createRainParticles(cloud, targetPlant) {
        // Create rain particles under the cloud
        const numDrops = 20;
        const rainGroup = new THREE.Group();
        
        for (let i = 0; i < numDrops; i++) {
            const dropGeometry = new THREE.BoxGeometry(0.05, 0.2, 0.05);
            const dropMaterial = new THREE.MeshBasicMaterial({ color: 0x4169E1 }); // Royal blue
            const drop = new THREE.Mesh(dropGeometry, dropMaterial);
            
            // Position drops randomly under the cloud
            const x = (Math.random() - 0.5) * 2;
            const y = 0;
            const z = (Math.random() - 0.5) * 2;
            
            drop.position.set(x, y, z);
            drop.userData = {
                velocity: 0.02 + Math.random() * 0.03,
                startY: cloud.mesh.position.y - 1 - Math.random() * 0.5
            };
            
            rainGroup.add(drop);
        }
        
        rainGroup.visible = false;
        this.scene.add(rainGroup);
        
        return rainGroup;
    }
    
    setupEventListeners() {
        // Mouse events for cloud creation
        window.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        // Keyboard events for camera movement
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
        
        // Window resize event
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }
    
    onMouseDown(event) {
        // Start creating a cloud on mouse down
        this.updateMousePosition(event);
        
        // Check if player has enough magic power
        const cloudCost = 20; // Magic power cost to create a cloud
        if (this.magicPower < cloudCost) {
            // Not enough magic power - show feedback
            this.showFeedbackMessage("Not enough magic power!");
            return;
        }
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Find intersection with ground plane
        const ray = this.raycaster.ray;
        if (ray.intersectPlane(this.groundPlane, this.groundIntersectPoint)) {
            // Consume magic power
            this.magicPower -= cloudCost;
            document.getElementById('magic-power').textContent = Math.floor(this.magicPower);
            
            // Create position above ground
            const position = new THREE.Vector3(
                this.groundIntersectPoint.x,
                15 + Math.random() * 8, // Height above ground
                this.groundIntersectPoint.z
            );
            
            // Create new cloud
            this.currentCloud = this.createCloud();
            this.currentCloud.mesh.position.copy(position);
            this.currentCloud.mesh.scale.set(0.1, 0.1, 0.1); // Start small
            this.scene.add(this.currentCloud.mesh);
            
            this.isCreatingCloud = true;
        }
    }
    
    showFeedbackMessage(message) {
        // Create a temporary message element
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.position = 'absolute';
        messageElement.style.top = '50%';
        messageElement.style.left = '50%';
        messageElement.style.transform = 'translate(-50%, -50%)';
        messageElement.style.color = 'white';
        messageElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        messageElement.style.padding = '10px 20px';
        messageElement.style.borderRadius = '5px';
        messageElement.style.fontSize = '18px';
        messageElement.style.fontWeight = 'bold';
        messageElement.style.zIndex = '1000';
        
        // Add to document
        document.body.appendChild(messageElement);
        
        // Remove after 2 seconds
        setTimeout(() => {
            document.body.removeChild(messageElement);
        }, 2000);
    }
    
    onMouseUp() {
        // Finish creating cloud on mouse up
        if (this.isCreatingCloud && this.currentCloud) {
            // Add cloud to clouds array
            this.clouds.push(this.currentCloud);
            
            // Create rain particles for this cloud
            this.currentCloud.rainParticles = this.createRainParticles(this.currentCloud);
            
            // Set cloud creation time for auto-dissolve after 10 seconds
            this.currentCloud.creationTime = Date.now();
            this.currentCloud.dissolveState = 0; // 0: normal, 1: dissolving, 2: dissolved
            
            // Chance to create special weather effects
            const weatherRoll = Math.random();
            
            if (weatherRoll < 0.05) {
                // 10% chance for rainbow
                // Find a suitable end position for the rainbow
                const startPos = this.currentCloud.mesh.position.clone();
                const endPos = new THREE.Vector3(
                    startPos.x + (Math.random() - 0.5) * 30,
                    0, // Ground level
                    startPos.z + (Math.random() - 0.5) * 30
                );
                
                // Create rainbow with slight delay
                setTimeout(() => {
                    this.createRainbow(startPos, endPos);
                }, 2000);
            } else if (weatherRoll < 0.15) {
                // 5% chance for lightning
                // Find a suitable end position for the lightning
                const startPos = this.currentCloud.mesh.position.clone();
                const endPos = new THREE.Vector3(
                    startPos.x + (Math.random() - 0.5) * 10,
                    0, // Ground level
                    startPos.z + (Math.random() - 0.5) * 10
                );
                
                // Create lightning with slight delay
                setTimeout(() => {
                    this.createLightning(startPos, endPos);
                }, 1000 + Math.random() * 2000);
            }
            
            this.isCreatingCloud = false;
            this.currentCloud = null;
        }
    }
    
    onMouseMove(event) {
        // Track mouse movement
        this.updateMousePosition(event);
    }
    
    updateMousePosition(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
    
    onKeyDown(event) {
        // Update key states on key down
        switch(event.key.toLowerCase()) {
            case 'w':
                this.keys.w = true;
                break;
            case 'a':
                this.keys.a = true;
                break;
            case 's':
                this.keys.s = true;
                break;
            case 'd':
                this.keys.d = true;
                break;
            case ' ':
                this.keys.space = true;
                break;
            case 'shift':
                this.keys.shift = true;
                break;
        }
    }
    
    onKeyUp(event) {
        // Update key states on key up
        switch(event.key.toLowerCase()) {
            case 'w':
                this.keys.w = false;
                break;
            case 'a':
                this.keys.a = false;
                break;
            case 's':
                this.keys.s = false;
                break;
            case 'd':
                this.keys.d = false;
                break;
            case ' ':
                this.keys.space = false;
                break;
            case 'shift':
                this.keys.shift = false;
                break;
        }
    }
    
    updateCameraMovement() {
        // Get forward and right vectors
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        right.y = 0;
        right.normalize();
        
        // Apply movement based on key states
        if (this.keys.w) {
            this.camera.position.addScaledVector(forward, this.movementSpeed);
            this.controls.target.addScaledVector(forward, this.movementSpeed);
        }
        if (this.keys.s) {
            this.camera.position.addScaledVector(forward, -this.movementSpeed);
            this.controls.target.addScaledVector(forward, -this.movementSpeed);
        }
        if (this.keys.a) {
            this.camera.position.addScaledVector(right, -this.movementSpeed);
            this.controls.target.addScaledVector(right, -this.movementSpeed);
        }
        if (this.keys.d) {
            this.camera.position.addScaledVector(right, this.movementSpeed);
            this.controls.target.addScaledVector(right, this.movementSpeed);
        }
        if (this.keys.space) {
            this.camera.position.y += this.verticalSpeed;
            this.controls.target.y += this.verticalSpeed;
        }
        if (this.keys.shift) {
            this.camera.position.y -= this.verticalSpeed;
            this.controls.target.y -= this.verticalSpeed;
        }
    }
    
    onWindowResize() {
        // Update camera and renderer on window resize
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.update();
        this.render();
    }
    
    update() {
        // Update day/night cycle
        this.updateDayNightCycle();
        
        // Regenerate magic power over time
        if (this.magicPower < 100) {
            this.magicPower = Math.min(100, this.magicPower + this.magicRegenRate);
            
            // Update UI every second (not every frame to avoid performance issues)
            if (Math.floor(Date.now() / 1000) % 1 === 0) {
                document.getElementById('magic-power').textContent = Math.floor(this.magicPower);
            }
        }
        
        // Update controls
        this.controls.update();
        
        // Update camera position based on keyboard input
        this.updateCameraMovement();
        
        // Update growing cloud if creating one
        if (this.isCreatingCloud && this.currentCloud) {
            // Grow the cloud over time
            if (this.currentCloud.mesh.scale.x < 1) {
                this.currentCloud.mesh.scale.x += 0.03;
                this.currentCloud.mesh.scale.y += 0.03;
                this.currentCloud.mesh.scale.z += 0.03;
            }
        }
        
        // Update existing clouds
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            const cloud = this.clouds[i];
            
            // Make clouds slowly float
            cloud.mesh.position.x += Math.sin(Date.now() * 0.001 + i) * 0.005;
            cloud.mesh.position.z += Math.cos(Date.now() * 0.0015 + i * 0.5) * 0.005;
            
            // Check cloud lifetime for auto-dissolve after 10 seconds
            const cloudAge = Date.now() - cloud.creationTime;
            
            if (cloudAge > 10000 && cloud.dissolveState === 0) {
                // Start dissolving after 10 seconds
                cloud.dissolveState = 1;
            }
            
            // Handle cloud dissolving
            if (cloud.dissolveState === 1) {
                let allDissolved = true;
                
                // Gradually reduce opacity of each puff
                cloud.mesh.children.forEach(puff => {
                    puff.material.opacity -= 0.01;
                    if (puff.material.opacity > 0) {
                        allDissolved = false;
                    }
                });
                
                // If all puffs are fully transparent, remove the cloud
                if (allDissolved) {
                    cloud.dissolveState = 2;
                    this.scene.remove(cloud.mesh);
                    if (cloud.rainParticles) {
                        this.scene.remove(cloud.rainParticles);
                    }
                    this.clouds.splice(i, 1);
                    continue; // Skip the rest of this loop iteration
                }
            }
            
            // Check if cloud is over a wilted plant
            if (!cloud.isRaining && cloud.dissolveState === 0) {
                for (let j = 0; j < this.plants.length; j++) {
                    const plant = this.plants[j];
                    
                    // Skip already revived plants
                    if (plant.revived) continue;
                    
                    // Check if cloud is over plant
                    const cloudX = cloud.mesh.position.x;
                    const cloudZ = cloud.mesh.position.z;
                    const plantX = plant.position.x;
                    const plantZ = plant.position.z;
                    
                    const distance = Math.sqrt(
                        Math.pow(cloudX - plantX, 2) + 
                        Math.pow(cloudZ - plantZ, 2)
                    );
                    
                    if (distance < 3) {
                        // Cloud is over a plant, start raining
                        cloud.isRaining = true;
                        cloud.targetPlant = plant;
                        cloud.rainParticles.visible = true;
                        cloud.rainParticles.position.copy(cloud.mesh.position);
                        break;
                    }
                }
            } else if (cloud.isRaining) {
                // Update rain animation
                this.updateRain(cloud);
                
                // Check if target plant is revived
                if (cloud.targetPlant && !cloud.targetPlant.revived) {
                    // Increase revived progress
                    cloud.targetPlant.revivedProgress += 0.01;
                    
                    if (cloud.targetPlant.revivedProgress >= 1) {
                        // Plant is fully revived
                        this.revivePlant(cloud.targetPlant);
                        
                        // Stop raining
                        cloud.isRaining = false;
                        cloud.rainParticles.visible = false;
                        cloud.targetPlant = null;
                        
                        // Increment rain count
                        cloud.rainCount++;
                        
                        // Check if cloud should fade
                        if (cloud.rainCount >= 3) {
                            // Fade cloud (reduce opacity)
                            cloud.mesh.children.forEach(puff => {
                                puff.material.opacity = 0.3;
                            });
                            
                            // Schedule cloud to be removed
                            setTimeout(() => {
                                this.scene.remove(cloud.mesh);
                                this.scene.remove(cloud.rainParticles);
                                this.clouds.splice(this.clouds.indexOf(cloud), 1);
                            }, 2000);
                        }
                    }
                }
            }
        }
        
        // Update plants in transition from wilted to revived
        for (let i = 0; i < this.plants.length; i++) {
            const plant = this.plants[i];
            
            if (plant.revivedProgress > 0 && plant.revivedProgress < 1 && plant.revivedMesh) {
                // Update transition between wilted and revived
                plant.mesh.visible = true;
                plant.revivedMesh.visible = true;
                
                // Adjust opacity based on progress
                plant.mesh.children.forEach(child => {
                    if (child.material) {
                        child.material.transparent = true;
                        child.material.opacity = 1 - plant.revivedProgress;
                    }
                });
                
                plant.revivedMesh.children.forEach(child => {
                    if (child.material) {
                        child.material.transparent = true;
                        child.material.opacity = plant.revivedProgress;
                    }
                });
            }
            
            // Handle plant growth over time after revival
            if (plant.revived && plant.revivedMesh) {
                // Only grow plants that have been fully revived and have room to grow
                if (plant.growthProgress < 1) {
                    // Slowly grow over time
                    plant.growthProgress += 0.001; // Very slow growth
                    
                    // Calculate current scale based on original scale and target growth
                    const currentScale = plant.scale + (plant.targetScale - plant.scale) * plant.growthProgress;
                    
                    // Apply scale to the revived plant
                    plant.revivedMesh.scale.set(currentScale, currentScale, currentScale);
                }
            }
        }
    }
    
    updateRain(cloud) {
        if (!cloud.isRaining || !cloud.rainParticles) return;
        
        // Animate rain drops
        cloud.rainParticles.children.forEach(drop => {
            // Move drop downward
            drop.position.y -= drop.userData.velocity;
            
            // Calculate the actual y position in world space (cloud position + drop position)
            const worldY = cloud.rainParticles.position.y + drop.position.y;
            
            // Reset drop when it reaches the ground (y=0)
            if (worldY <= 0) {
                // Reset to starting position at the cloud
                drop.position.y = drop.userData.startY;
                
                // Add splash effect at ground level (optional)
                if (Math.random() < 0.3) { // Only create splash for some drops to avoid too many effects
                    this.createRainSplash(
                        new THREE.Vector3(
                            cloud.rainParticles.position.x + drop.position.x,
                            0.05, // Slightly above ground to be visible
                            cloud.rainParticles.position.z + drop.position.z
                        )
                    );
                }
            }
        });
        
        // Update target plant revived progress
        if (cloud.targetPlant && !cloud.targetPlant.revived) {
            cloud.targetPlant.revivedProgress = Math.min(1, cloud.targetPlant.revivedProgress + 0.01);
        }
    }
    
    createRainSplash(position) {
        // Create a simple splash effect for rain drops
        const splashGeometry = new THREE.CircleGeometry(0.05 + Math.random() * 0.05, 6);
        const splashMaterial = new THREE.MeshBasicMaterial({
            color: 0x4169E1, // Royal blue
            transparent: true,
            opacity: 0.7
        });
        
        const splash = new THREE.Mesh(splashGeometry, splashMaterial);
        splash.position.copy(position);
        splash.rotation.x = -Math.PI / 2; // Flat on the ground
        this.scene.add(splash);
        
        // Fade out and grow splash
        const startTime = Date.now();
        const duration = 300 + Math.random() * 200; // 300-500ms
        
        const animateSplash = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            
            if (progress >= 1) {
                // Remove splash when animation is complete
                this.scene.remove(splash);
                return;
            }
            
            // Grow the splash
            const scale = 1 + progress * 2;
            splash.scale.set(scale, scale, 1);
            
            // Fade out splash
            splashMaterial.opacity = 0.7 * (1 - progress);
            
            requestAnimationFrame(animateSplash);
        };
        
        animateSplash();
    }
    
    revivePlant(plant) {
        // Create revived version of the plant based on its type and scale
        const revivedMesh = this.createRevivedPlant(plant.position, plant.type, plant.scale);
        this.scene.add(revivedMesh);
        
        // Store the revived mesh
        plant.revivedMesh = revivedMesh;
        plant.revived = true;
        plant.growthProgress = 0; // Initialize growth progress for growing over time
        plant.targetScale = plant.scale * plant.maxGrowthScale; // Target final scale based on random growth factor
        
        // Add particle effect for revival
        this.createRevivalParticles(plant.position);
        
        // Play plant growth sound
        if (this.audioEnabled) {
            if (this.hasPlantSound) {
                this.plantGrowSound.currentTime = 0;
                this.plantGrowSound.play().catch(e => {});
            }
        }
        
        // Update score
        this.plantsRevived++;
        document.getElementById('plants-revived').textContent = this.plantsRevived;
        
        // Add magic power as reward
        this.magicPower = Math.min(100, this.magicPower + 10);
        document.getElementById('magic-power').textContent = Math.floor(this.magicPower);
        
        // Make the wilted plant invisible
        setTimeout(() => {
            plant.mesh.visible = false;
            plant.revivedMesh.children.forEach(child => {
                if (child.material) {
                    child.material.transparent = false;
                    child.material.opacity = 1;
                }
            });
        }, 3000);
    }
    
    createRevivalParticles(position) {
        // Create particle system for plant revival effect
        const particleCount = 50;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const particleSizes = new Float32Array(particleCount);
        const particleColors = new Float32Array(particleCount * 3);
        
        // Set initial positions and colors
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // Random position in a small sphere around the plant
            const radius = 0.5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            particlePositions[i3] = position.x + radius * Math.sin(phi) * Math.cos(theta);
            particlePositions[i3 + 1] = position.y + Math.random() * 2; // Height variation
            particlePositions[i3 + 2] = position.z + radius * Math.sin(phi) * Math.sin(theta);
            
            // Random size
            particleSizes[i] = 0.1 + Math.random() * 0.2;
            
            // Bright green/yellow colors
            particleColors[i3] = 0.5 + Math.random() * 0.5; // R: yellow-green
            particleColors[i3 + 1] = 0.8 + Math.random() * 0.2; // G: bright green
            particleColors[i3 + 2] = 0.1 + Math.random() * 0.3; // B: slight blue tint
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
        
        // Create particle material
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        // Create particle system
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);
        
        // Animate particles
        const startTime = Date.now();
        const duration = 2000; // 2 seconds
        
        const animateParticles = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            
            if (progress >= 1) {
                // Animation complete, remove particles
                this.scene.remove(particles);
                return;
            }
            
            // Update particle positions (float upward)
            const positions = particleGeometry.attributes.position.array;
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                positions[i3 + 1] += 0.03; // Move upward
                
                // Add some random horizontal movement
                positions[i3] += (Math.random() - 0.5) * 0.02;
                positions[i3 + 2] += (Math.random() - 0.5) * 0.02;
            }
            particleGeometry.attributes.position.needsUpdate = true;
            
            // Fade out particles
            particleMaterial.opacity = 1 - progress;
            
            // Continue animation
            requestAnimationFrame(animateParticles);
        };
        
        // Start animation
        animateParticles();
    }
    
    createRevivedPlant(position, type, scale) {
        // Create a vibrant, revived plant based on type
        if (type === 'bush') {
            return this.createRevivedBush(position, scale);
        } else if (type === 'tallplant') {
            return this.createRevivedTallPlant(position, scale);
        } else if (type === 'ivy') {
            return this.createRevivedIvy(position, scale);
        } else {
            // Default is flower
            return this.createRevivedFlower(position, scale);
        }
    }
    
    createRevivedFlower(position, scale) {
        // Create a vibrant, revived flower
        const plantGroup = new THREE.Group();
        
        // Stem color variations (greens)
        const stemColors = [
            0x228B22, // Forest Green
            0x32CD32, // Lime Green
            0x006400, // Dark Green
            0x008000, // Green
        ];
        const stemColor = stemColors[Math.floor(Math.random() * stemColors.length)];
        
        // Stem - increased height variation
        const stemHeight = 1.5 + Math.random() * 1.5; // 1.5 to 3.0
        const stemThickness = 0.05 + Math.random() * 0.1; // 0.05 to 0.15
        const stemGeometry = new THREE.CylinderGeometry(stemThickness, stemThickness * 1.5, stemHeight, 5, 1);
        const stemMaterial = new THREE.MeshLambertMaterial({ color: stemColor });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = stemHeight / 2;
        stem.castShadow = true;
        
        // Add leaves (2-5 leaves)
        const numLeaves = 2 + Math.floor(Math.random() * 4);
        const leafColors = [
            0x32CD32, // Lime Green
            0x00FF00, // Green
            0x7CFC00, // Lawn Green
            0x90EE90, // Light Green
        ];
        
        for (let i = 0; i < numLeaves; i++) {
            const leafSize = 0.15 + Math.random() * 0.25;
            
            // Create a natural leaf shape instead of triangular shape
            const leafWidth = leafSize * 1.5;
            const leafHeight = leafSize * 2;
            
            // Create leaf shape
            const leafShape = new THREE.Shape();
            
            // Create an oval-like leaf shape
            leafShape.moveTo(0, 0);
            leafShape.bezierCurveTo(
                leafWidth/2, leafHeight/4,
                leafWidth/2, leafHeight*3/4,
                0, leafHeight
            );
            leafShape.bezierCurveTo(
                -leafWidth/2, leafHeight*3/4,
                -leafWidth/2, leafHeight/4,
                0, 0
            );
            
            const leafGeometry = new THREE.ShapeGeometry(leafShape);
            const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
            const leafMaterial = new THREE.MeshLambertMaterial({ 
                color: leafColor,
                side: THREE.DoubleSide
            });
            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
            
            // Position leaf along stem
            const height = 0.4 + (i / numLeaves) * (stemHeight * 0.8);
            const angle = (i / numLeaves) * Math.PI * 2;
            leaf.position.y = height;
            leaf.position.x = Math.cos(angle) * 0.3;
            leaf.position.z = Math.sin(angle) * 0.3;
            
            // Rotate leaf outward
            leaf.rotation.x = Math.PI / 2; // Make leaf vertical
            leaf.rotation.y = Math.random() * 0.3 - 0.15; // Slight random tilt
            leaf.rotation.z = angle; // Face outward
            
            leaf.castShadow = true;
            plantGroup.add(leaf);
        }
        
        // Add flower with more variety of colors and shapes
        const flowerColors = [
            0xFF0000, // Red
            0xFFFF00, // Yellow
            0xFF00FF, // Magenta
            0xFF4500, // Orange-red
            0x9932CC, // Purple
            0xFF69B4, // Hot Pink
            0x00FFFF, // Cyan
            0xFFA500, // Orange
            0xFFB6C1, // Light Pink
            0x4B0082, // Indigo
        ];
        
        const flowerColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        
        // Randomize flower shape
        let flowerGeometry;
        const flowerType = Math.floor(Math.random() * 4); // Added one more type
        const flowerSize = 0.25 + Math.random() * 0.4; // 0.25 to 0.65 (larger flowers possible)
        
        if (flowerType === 0) {
            flowerGeometry = new THREE.DodecahedronGeometry(flowerSize, 0);
        } else if (flowerType === 1) {
            flowerGeometry = new THREE.IcosahedronGeometry(flowerSize, 0);
        } else if (flowerType === 2) {
            flowerGeometry = new THREE.OctahedronGeometry(flowerSize, 0);
        } else {
            // New type: flatter, more petal-like flower
            flowerGeometry = new THREE.SphereGeometry(flowerSize * 1.2, 8, 4);
        }
        
        const flowerMaterial = new THREE.MeshLambertMaterial({ color: flowerColor });
        const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
        flower.position.y = stemHeight + 0.1;
        
        // If it's the flatter type, squash it to look more like a daisy
        if (flowerType === 3) {
            flower.scale.y = 0.3;
        }
        
        flower.castShadow = true;
        
        // Add to group
        plantGroup.add(stem);
        plantGroup.add(flower);
        
        // Position the plant
        plantGroup.position.copy(position);
        // Apply the same scale as the wilted version
        plantGroup.scale.set(scale, scale, scale);
        
        return plantGroup;
    }
    
    createRevivedBush(position, scale) {
        // Create a vibrant, revived bush
        const bushGroup = new THREE.Group();
        
        // Base - variable size
        const baseRadius = 0.15 + Math.random() * 0.25;
        const baseHeight = 0.3 + Math.random() * 0.4;
        const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.3, baseHeight, 8, 1);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = baseHeight / 2;
        base.castShadow = true;
        bushGroup.add(base);
        
        // Leaf colors
        const leafColors = [
            0x006400, // Dark Green
            0x228B22, // Forest Green
            0x32CD32, // Lime Green
            0x556B2F, // Olive Green
        ];
        
        // Add multiple vibrant leaf clusters
        const numClusters = 5 + Math.floor(Math.random() * 6); // 5-10 clusters (more fullness)
        const bushWidth = 0.6 + Math.random() * 1.2; // 0.6 to 1.8 (wider bush variation)
        const bushHeight = 0.8 + Math.random() * 1.0; // 0.8 to 1.8 (taller bush variation)
        
        for (let i = 0; i < numClusters; i++) {
            const clusterSize = 0.25 + Math.random() * 0.35;
            const clusterGeometry = new THREE.IcosahedronGeometry(clusterSize, 1);
            const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
            const clusterMaterial = new THREE.MeshLambertMaterial({ color: leafColor });
            const cluster = new THREE.Mesh(clusterGeometry, clusterMaterial);
            
            // Position clusters around the base in 3D
            const angle = (i / numClusters) * Math.PI * 2;
            const radius = bushWidth * (0.3 + Math.random() * 0.7); // Random distance from center
            const height = baseHeight + Math.random() * bushHeight; // Variable height
            
            cluster.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );
            
            // Randomize scale slightly
            const clusterScale = 0.8 + Math.random() * 0.4;
            cluster.scale.set(clusterScale, clusterScale, clusterScale);
            
            cluster.castShadow = true;
            bushGroup.add(cluster);
            
            // Add sub-clusters for more fullness (33% chance per cluster)
            if (Math.random() < 0.33) {
                const subClusterSize = clusterSize * 0.8;
                const subGeometry = new THREE.IcosahedronGeometry(subClusterSize, 1);
                const subMaterial = new THREE.MeshLambertMaterial({ color: leafColor });
                const subCluster = new THREE.Mesh(subGeometry, subMaterial);
                
                // Position near the main cluster
                const subAngle = angle + (Math.random() - 0.5) * 0.5;
                const subRadius = radius * 0.8;
                const subHeight = height + (Math.random() - 0.5) * 0.3;
                
                subCluster.position.set(
                    Math.cos(subAngle) * subRadius,
                    subHeight,
                    Math.sin(subAngle) * subRadius
                );
                
                subCluster.castShadow = true;
                bushGroup.add(subCluster);
            }
        }
        
        // Add some small flowers for decoration (increased chance and count)
        const numFlowers = Math.floor(Math.random() * 6) + 1; // 1-6 flowers
        const flowerColors = [
            0xFF0000, // Red
            0xFFFF00, // Yellow
            0xFFFFFF, // White
            0xFFA500, // Orange
            0xFF69B4, // Pink
            0x800080, // Purple
        ];
        
        for (let i = 0; i < numFlowers; i++) {
            const flowerSize = 0.1 + Math.random() * 0.12;
            const flowerGeometry = new THREE.DodecahedronGeometry(flowerSize, 0);
            const flowerColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            const flowerMaterial = new THREE.MeshLambertMaterial({ color: flowerColor });
            const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
            
            // Position flowers throughout the bush
            const angle = Math.random() * Math.PI * 2;
            const radius = bushWidth * 0.7 * Math.random();
            flower.position.set(
                Math.cos(angle) * radius,
                baseHeight + (bushHeight * 0.5) + Math.random() * (bushHeight * 0.5),
                Math.sin(angle) * radius
            );
            
            flower.castShadow = true;
            bushGroup.add(flower);
        }
        
        // Position the bush
        bushGroup.position.copy(position);
        // Apply the same scale as the wilted version
        bushGroup.scale.set(scale, scale, scale);
        
        return bushGroup;
    }
    
    createRevivedTallPlant(position, scale) {
        // Create a vibrant, revived tall plant (tree-like)
        const tallPlantGroup = new THREE.Group();
        
        // Trunk with more height variation
        const trunkHeight = 2.5 + Math.random() * 3.0; // 2.5 to 5.5
        const trunkThickness = 0.1 + Math.random() * 0.2; // 0.1 to 0.3
        const trunkGeometry = new THREE.CylinderGeometry(trunkThickness, trunkThickness * 1.4, trunkHeight, 8, 3);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true;
        tallPlantGroup.add(trunk);
        
        // Leaf colors
        const leafColors = [
            0x006400, // Dark Green
            0x228B22, // Forest Green
            0x32CD32, // Lime Green
            0x006400, // Dark Green
        ];
        
        // Add vibrant leaves/branches
        const numLeaves = 6 + Math.floor(Math.random() * 6); // 6-11 leaves
        const leafSpreadFactor = 0.3 + Math.random() * 0.5; // How far leaves extend from trunk
        
        for (let i = 0; i < numLeaves; i++) {
            // Replace cone geometry with natural leaf shapes
            const leafWidth = 0.3 + Math.random() * 0.2;
            const leafHeight = 0.8 + Math.random() * 0.4;
            
            // Create leaf shape
            const leafShape = new THREE.Shape();
            
            // Create an irregular leaf shape
            leafShape.moveTo(0, 0);
            leafShape.bezierCurveTo(
                leafWidth * 0.2, leafHeight * 0.3,
                leafWidth * 0.4, leafHeight * 0.6,
                leafWidth * 0.5, leafHeight
            );
            leafShape.bezierCurveTo(
                leafWidth * 0.6, leafHeight * 0.6,
                leafWidth * 0.8, leafHeight * 0.3,
                leafWidth, 0
            );
            leafShape.bezierCurveTo(
                leafWidth * 0.8, -leafHeight * 0.1,
                leafWidth * 0.2, -leafHeight * 0.1,
                0, 0
            );
            
            const leafGeometry = new THREE.ShapeGeometry(leafShape);
            const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
            const leafMaterial = new THREE.MeshLambertMaterial({ 
                color: leafColor, 
                side: THREE.DoubleSide 
            });
            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
            
            // Position leaves along upper part of trunk
            const heightPercentage = 0.4 + (i / numLeaves) * 0.6; // More spread along trunk
            const height = trunkHeight * heightPercentage;
            const angle = (i / numLeaves) * Math.PI * 2;
            
            // Calculate the radius of the trunk at this height (trunk is tapered and curved)
            const heightRatio = height / trunkHeight;
            // Get basic trunk radius at this height
            const trunkRadiusAtHeight = trunkThickness * (1 - heightRatio) + (trunkThickness * 1.3) * heightRatio;
            
            // Account for trunk curve for leaves high up on the trunk
            const curveOffsetX = height > trunkHeight/2 ? (height - trunkHeight/2) * 0.2 : 0;
            
            leaf.position.y = height;
            // Position leaves directly at the trunk surface with the curve offset
            leaf.position.x = Math.cos(angle) * trunkRadiusAtHeight + curveOffsetX;
            leaf.position.z = Math.sin(angle) * trunkRadiusAtHeight;
            
            // Rotate leaf to look wilted and face outward
            leaf.rotation.x = Math.PI * 0.4; // Less steep angle than before
            leaf.rotation.y = Math.random() * Math.PI * 0.3 - Math.PI * 0.15; // Slight random rotation
            leaf.rotation.z = angle;
            
            leaf.castShadow = true;
            tallPlantGroup.add(leaf);
        }
        
        // Add a top canopy for tree-like plants
        const canopyWidth = 0.6 + Math.random() * 0.8; // 0.6 to 1.4
        const canopyHeight = 0.8 + Math.random() * 1.2; // 0.8 to 2.0
        const canopyGeometry = new THREE.SphereGeometry(canopyWidth, 8, 6);
        const canopyColor = leafColors[Math.floor(Math.random() * leafColors.length)];
        const canopyMaterial = new THREE.MeshLambertMaterial({ color: canopyColor });
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        canopy.position.y = trunkHeight + 0.3;
        canopy.scale.set(1.0, canopyHeight / canopyWidth, 1.0); // Varied shape
        canopy.castShadow = true;
        tallPlantGroup.add(canopy);
        
        // Position the plant
        tallPlantGroup.position.copy(position);
        // Apply the same scale as the wilted version
        tallPlantGroup.scale.set(scale, scale, scale);
        
        return tallPlantGroup;
    }
    
    createRevivedIvy(position, scale) {
        // Create a vibrant, revived climbing ivy plant
        const ivyGroup = new THREE.Group();
        
        // Base/root
        const baseRadius = 0.12 + Math.random() * 0.1;
        const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.3, 0.15, 6, 1);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.075;
        base.castShadow = true;
        ivyGroup.add(base);
        
        // Vibrant ivy colors - very bright and colorful
        const ivyColors = [
            0x00FF00, // Bright Green
            0x32CD32, // Lime Green
            0x7CFC00, // Lawn Green
            0x00FA9A, // Medium Spring Green
            0x7FFF00, // Chartreuse
            0x90EE90, // Light Green
        ];
        
        // Add some blue/purple flowering colors
        const flowerColors = [
            0x9370DB, // Medium Purple
            0x6A5ACD, // Slate Blue
            0x483D8B, // Dark Slate Blue
            0x4B0082, // Indigo
        ];
        
        // Create climbing vine structure
        const numVines = 3 + Math.floor(Math.random() * 3); // 3-5 main vines
        
        for (let i = 0; i < numVines; i++) {
            // More elaborate vine with segments
            const vineHeight = 1.5 + Math.random() * 2.0; // 1.5-3.5 units (taller than wilted)
            const numSegments = 4 + Math.floor(Math.random() * 4); // 4-7 segments
            const segmentHeight = vineHeight / numSegments;
            
            const stemColor = ivyColors[Math.floor(Math.random() * ivyColors.length)];
            
            // Base angle for this vine
            const baseAngle = (i / numVines) * Math.PI * 2;
            
            // Create vine segments with curves
            let prevX = Math.cos(baseAngle) * 0.12;
            let prevZ = Math.sin(baseAngle) * 0.12;
            let prevY = 0.1; // Start slightly above ground
            
            for (let j = 0; j < numSegments; j++) {
                const segmentGeometry = new THREE.CylinderGeometry(0.025, 0.035, segmentHeight, 5, 1);
                const segmentMaterial = new THREE.MeshLambertMaterial({ color: stemColor });
                const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
                
                // Create a curved path for the vine - more elegant curves
                const bendAngle = baseAngle + (Math.sin(j * 0.8) * 0.3);
                const bendDistance = 0.15 + (j * 0.05);
                
                const x = prevX + Math.cos(bendAngle) * bendDistance;
                const z = prevZ + Math.sin(bendAngle) * bendDistance;
                const y = prevY + segmentHeight / 2;
                
                segment.position.set(x, y, z);
                
                // Healthier vine doesn't droop as much
                const bendFactor = j / numSegments * 0.3; // Much less bend (0.3 vs 0.8)
                segment.rotation.x = bendFactor;
                segment.rotation.z = (Math.random() - 0.5) * 0.2; // Less random tilt
                segment.rotation.y = bendAngle;
                
                segment.castShadow = true;
                ivyGroup.add(segment);
                
                // Save end position for next segment
                prevX = x;
                prevZ = z;
                prevY = y + segmentHeight / 2;
                
                // Add vibrant leaves to each segment
                const numLeaves = 3 + Math.floor(Math.random() * 4); // 3-6 leaves per segment (more leaves)
                
                for (let k = 0; k < numLeaves; k++) {
                    // Create healthy leaf
                    const leafSize = 0.12 + Math.random() * 0.15; // Larger leaves
                    const leafShape = new THREE.Shape();
                    
                    // Perfect heart-shaped leaf for ivy
                    leafShape.moveTo(0, leafSize);
                    leafShape.bezierCurveTo(leafSize/2, leafSize, leafSize, leafSize/2, leafSize, 0);
                    leafShape.bezierCurveTo(leafSize, -leafSize/2, leafSize/2, -leafSize, 0, -leafSize);
                    leafShape.bezierCurveTo(-leafSize/2, -leafSize, -leafSize, -leafSize/2, -leafSize, 0);
                    leafShape.bezierCurveTo(-leafSize, leafSize/2, -leafSize/2, leafSize, 0, leafSize);
                    
                    const leafGeometry = new THREE.ShapeGeometry(leafShape);
                    
                    // Randomize leaf color with bright variations
                    let leafColor;
                    
                    // 15% chance of being a flowering leaf (different color)
                    if (Math.random() < 0.15) {
                        leafColor = new THREE.Color(flowerColors[Math.floor(Math.random() * flowerColors.length)]);
                    } else {
                        // Normal leaf with variations
                        const colorVariation = Math.random() * 0.3 - 0.1; // -0.1 to 0.2
                        leafColor = new THREE.Color(stemColor);
                        leafColor.g = Math.max(0, Math.min(1, leafColor.g + colorVariation));
                    }
                    
                    const leafMaterial = new THREE.MeshLambertMaterial({ 
                        color: leafColor,
                        side: THREE.DoubleSide
                    });
                    
                    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                    
                    // Position leaf along segment
                    const leafAngle = Math.random() * Math.PI * 2;
                    const leafDistance = 0.06 + Math.random() * 0.06;
                    const leafHeight = (k / numLeaves) * segmentHeight * 0.8;
                    
                    leaf.position.set(
                        x + Math.cos(leafAngle) * leafDistance,
                        y - segmentHeight/2 + leafHeight,
                        z + Math.sin(leafAngle) * leafDistance
                    );
                    
                    // Healthy leaves face upward more
                    leaf.rotation.x = Math.PI / 3 + (Math.random() - 0.5) * 0.4; // More upward-facing 
                    leaf.rotation.y = Math.random() * Math.PI * 2;
                    leaf.rotation.z = Math.random() * Math.PI * 2;
                    
                    // Full, healthy leaf scale
                    leaf.scale.x = 0.9 + Math.random() * 0.2;
                    leaf.scale.y = 0.9 + Math.random() * 0.2;
                    
                    leaf.castShadow = true;
                    ivyGroup.add(leaf);
                }
                
                // Add occasional small flowers (25% chance per segment)
                if (Math.random() < 0.25) {
                    // Add 1-3 small flowers
                    const numFlowers = 1 + Math.floor(Math.random() * 3);
                    
                    for (let f = 0; f < numFlowers; f++) {
                        const flowerSize = 0.08 + Math.random() * 0.07;
                        const flowerGeometry = new THREE.DodecahedronGeometry(flowerSize, 0);
                        const flowerColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
                        const flowerMaterial = new THREE.MeshLambertMaterial({ color: flowerColor });
                        const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
                        
                        // Position flower on vine
                        const flowerAngle = Math.random() * Math.PI * 2;
                        const flowerDistance = 0.08 + Math.random() * 0.04;
                        const flowerHeight = Math.random() * segmentHeight * 0.8;
                        
                        flower.position.set(
                            x + Math.cos(flowerAngle) * flowerDistance,
                            y - segmentHeight/2 + flowerHeight,
                            z + Math.sin(flowerAngle) * flowerDistance
                        );
                        
                        flower.castShadow = true;
                        ivyGroup.add(flower);
                    }
                }
            }
        }
        
        // Position the ivy plant
        ivyGroup.position.copy(position);
        // Apply the scale
        ivyGroup.scale.set(scale, scale, scale);
        
        return ivyGroup;
    }
    
    createRock() {
        // Create a simple rock using a deformed geometry
        const rockGeometry = new THREE.DodecahedronGeometry(0.5, 0);
        
        // Deform vertices randomly to make it look more like a rock
        // Using Three.js attribute approach for geometry vertices
        if (rockGeometry.attributes && rockGeometry.attributes.position) {
            const positionAttribute = rockGeometry.attributes.position;
            for (let i = 0; i < positionAttribute.count; i++) {
                const x = positionAttribute.getX(i);
                const y = positionAttribute.getY(i);
                const z = positionAttribute.getZ(i);
                
                positionAttribute.setX(i, x + (Math.random() - 0.5) * 0.2);
                positionAttribute.setY(i, y + (Math.random() - 0.5) * 0.2);
                positionAttribute.setZ(i, z + (Math.random() - 0.5) * 0.2);
            }
            positionAttribute.needsUpdate = true;
        }
        
        // Rock colors
        const rockColors = [
            0x808080, // Gray
            0x696969, // Dim Gray
            0xA9A9A9, // Dark Gray
            0x778899, // Light Slate Gray
        ];
        
        const rockColor = rockColors[Math.floor(Math.random() * rockColors.length)];
        const rockMaterial = new THREE.MeshLambertMaterial({ color: rockColor });
        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        
        // Position slightly into the ground
        rock.position.y = 0.15;
        rock.castShadow = true;
        rock.receiveShadow = true;
        
        return rock;
    }
    
    createPlants() {
        // Create 70-110 wilted plants with great variety (significantly increased from 50-80)
        const numPlants = 70 + Math.floor(Math.random() * 41); 
        
        // Define the safe area for plant spawning (ground is 100x100)
        const safeRadius = 45; // Ensure plants stay within the ground
        
        for (let i = 0; i < numPlants; i++) {
            // Determine plant type with probabilities
            const plantType = Math.random();
            let plant;
            
            if (plantType < 0.3) {
                // Regular flower (30% chance, reduced from 35%)
                plant = this.createWiltedPlant();
            } else if (plantType < 0.5) {
                // Bush (20% chance, reduced from 25%)
                plant = this.createWiltedBush();
            } else if (plantType < 0.7) {
                // Tall plant (20% chance)
                plant = this.createWiltedTallPlant();
            } else if (plantType < 0.85) {
                // New ivy plant (15% chance, reduced from 20%)
                plant = this.createWiltedIvyPlant();
            } else {
                // New: clustered wilted plants (15% chance)
                plant = this.createWiltedCluster();
            }
            
            // Position randomly on the ground, ensuring they stay within bounds
            let x, z;
            let isValidPosition = false;
            
            // Use rejection sampling to ensure plants stay within the safe radius
            while (!isValidPosition) {
                x = (Math.random() - 0.5) * (2 * safeRadius);
                z = (Math.random() - 0.5) * (2 * safeRadius);
                
                // Check if position is within the safe radius
                if (Math.sqrt(x * x + z * z) <= safeRadius) {
                    isValidPosition = true;
                }
            }
            
            plant.position.set(x, 0, z);
            
            // More varied scaling (0.4 to 2.0 times original size)
            const scale = 0.4 + Math.random() * 1.6;
            plant.scale.set(scale, scale, scale);
            
            // Rotation for variety
            plant.rotation.y = Math.random() * Math.PI * 2;
            
            // Add to scene and plants array
            this.scene.add(plant);
            this.plants.push({
                mesh: plant,
                revived: false,
                revivedMesh: null,
                revivedProgress: 0,
                position: new THREE.Vector3(x, 0, z),
                type: plantType < 0.3 ? 'flower' : 
                      (plantType < 0.5 ? 'bush' : 
                      (plantType < 0.7 ? 'tallplant' : 
                      (plantType < 0.85 ? 'ivy' : 'cluster'))),
                scale: scale,
                maxGrowthScale: 1 + Math.random() * 1.5 // Plants can grow 1-2.5x their revived size
            });
        }
    }
    
    createWiltedPlant() {
        const plant = new THREE.Group();
        
        // Stem
        const stemHeight = 0.8 + Math.random() * 1.0; // More height variation
        const stemGeometry = new THREE.CylinderGeometry(0.03, 0.05, stemHeight, 8);
        
        // More varied stem colors
        const stemColorVariations = [
            new THREE.Color(0.3 + Math.random() * 0.2, 0.25 + Math.random() * 0.15, 0.1 + Math.random() * 0.1), // Brown
            new THREE.Color(0.4 + Math.random() * 0.2, 0.3 + Math.random() * 0.15, 0.2 + Math.random() * 0.1),  // Lighter brown
            new THREE.Color(0.2 + Math.random() * 0.15, 0.2 + Math.random() * 0.15, 0.1 + Math.random() * 0.05) // Darker brown
        ];
        
        const stemMaterial = new THREE.MeshLambertMaterial({
            color: stemColorVariations[Math.floor(Math.random() * stemColorVariations.length)]
        });
        
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = stemHeight / 2;
        plant.add(stem);
        
        // Determine flower shape variation
        const flowerStyle = Math.random();
        
        if (flowerStyle < 0.6) { // 60% for normal petal style
            // Flower head - wilted petals
            const petalCount = 4 + Math.floor(Math.random() * 5); // 4-8 petals
            for (let i = 0; i < petalCount; i++) {
                const petalLength = 0.2 + Math.random() * 0.3;
                const petalWidth = 0.1 + Math.random() * 0.15;
                
                // Create a custom 2D shape for the petal
                const shape = new THREE.Shape();
                shape.moveTo(0, 0);
                shape.bezierCurveTo(
                    petalWidth/2, petalLength/3,
                    petalWidth/2, petalLength*2/3,
                    0, petalLength
                );
                shape.bezierCurveTo(
                    -petalWidth/2, petalLength*2/3,
                    -petalWidth/2, petalLength/3,
                    0, 0
                );
                
                const petalGeometry = new THREE.ShapeGeometry(shape);
                
                // Create varied wilted colors from gray-brown to yellow-brown
                const wiltedColor = new THREE.Color(
                    0.3 + Math.random() * 0.25, // Red component
                    0.2 + Math.random() * 0.2, // Green component
                    0.1 + Math.random() * 0.05 // Blue component
                );
                
                const petalMaterial = new THREE.MeshLambertMaterial({
                    color: wiltedColor,
                    side: THREE.DoubleSide
                });
                
                const petal = new THREE.Mesh(petalGeometry, petalMaterial);
                petal.position.y = stemHeight;
                
                // Rotate around the center and droop down for wilted look
                const angle = (i / petalCount) * Math.PI * 2;
                petal.rotation.x = Math.PI / 2 + (Math.random() * 0.5); // Droop down with variation
                petal.rotation.y = angle;
                
                plant.add(petal);
            }
        } else if (flowerStyle < 0.85) { // 25% for drooped daisy style
            // Create a drooped center disk
            const centerRadius = 0.15 + Math.random() * 0.1;
            const centerGeometry = new THREE.CircleGeometry(centerRadius, 8);
            const centerMaterial = new THREE.MeshLambertMaterial({ 
                color: new THREE.Color(0.4 + Math.random() * 0.2, 0.3 + Math.random() * 0.1, 0.1), 
                side: THREE.DoubleSide 
            });
            const center = new THREE.Mesh(centerGeometry, centerMaterial);
            center.position.y = stemHeight;
            center.rotation.x = Math.PI / 2 + Math.random() * 0.8; // Drooped down
            center.rotation.z = Math.random() * Math.PI * 2; // Random rotation
            plant.add(center);
            
            // Add drooped petals
            const petalCount = 6 + Math.floor(Math.random() * 6); // 6-11 petals
            for (let i = 0; i < petalCount; i++) {
                const petalLength = 0.2 + Math.random() * 0.15;
                const petalWidth = 0.08 + Math.random() * 0.07;
                
                // Elongated petal shape
                const shape = new THREE.Shape();
                shape.moveTo(0, 0);
                shape.bezierCurveTo(
                    petalWidth/2, petalLength/4,
                    petalWidth/2, petalLength*3/4,
                    0, petalLength
                );
                shape.bezierCurveTo(
                    -petalWidth/2, petalLength*3/4,
                    -petalWidth/2, petalLength/4,
                    0, 0
                );
                
                const petalGeometry = new THREE.ShapeGeometry(shape);
                
                // Create varied wilted colors (more varied)
                const wiltedColor = new THREE.Color(
                    0.4 + Math.random() * 0.3, // Red component - more yellow
                    0.3 + Math.random() * 0.2, // Green component
                    0.1 + Math.random() * 0.1  // Blue component
                );
                
                const petalMaterial = new THREE.MeshLambertMaterial({
                    color: wiltedColor,
                    side: THREE.DoubleSide
                });
                
                const petal = new THREE.Mesh(petalGeometry, petalMaterial);
                petal.position.y = stemHeight;
                
                // Position around center and droop
                const angle = (i / petalCount) * Math.PI * 2;
                petal.position.x = Math.cos(angle) * centerRadius * 0.8;
                petal.position.z = Math.sin(angle) * centerRadius * 0.8;
                
                // Rotate to droop down and face outward
                petal.rotation.x = center.rotation.x + (Math.random() * 0.4 - 0.2); // Similar angle to center
                petal.rotation.y = Math.random() * 0.3 - 0.15; // Slight random tilt
                petal.rotation.z = angle; // Face outward
                
                plant.add(petal);
            }
        } else { // 15% for droopy bell flower
            // Create a bell-shaped flower
            const bellRadius = 0.15 + Math.random() * 0.1;
            const bellHeight = 0.25 + Math.random() * 0.15;
            const bellGeometry = new THREE.CylinderGeometry(bellRadius, bellRadius * 0.7, bellHeight, 6, 1, true);
            
            // Create varied wilted bell colors
            const bellColor = new THREE.Color(
                0.3 + Math.random() * 0.2, // Red
                0.2 + Math.random() * 0.1, // Green
                0.25 + Math.random() * 0.1  // Blue - more purple tones
            );
            
            const bellMaterial = new THREE.MeshLambertMaterial({
                color: bellColor,
                side: THREE.DoubleSide
            });
            
            const bell = new THREE.Mesh(bellGeometry, bellMaterial);
            bell.position.y = stemHeight;
            
            // Droop the bell
            bell.rotation.x = Math.PI + Math.random() * 0.5; // Facing down with variation
            
            plant.add(bell);
        }
        
        return plant;
    }
    
    createWiltedBush() {
        // Create a wilted bush
        const bushGroup = new THREE.Group();
        
        // Base - more variation in size
        const baseRadius = 0.15 + Math.random() * 0.25; // 0.15 to 0.4
        const baseHeight = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
        const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.5, baseHeight, 6, 1);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x6b8e23 }); // OliveDrab (less vibrant)
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = baseHeight / 2;
        base.castShadow = true;
        bushGroup.add(base);
        
        // Add multiple wilted leaf clusters
        const numClusters = 4 + Math.floor(Math.random() * 5); // 4-8 clusters
        
        for (let i = 0; i < numClusters; i++) {
            const clusterSize = 0.2 + Math.random() * 0.4; // 0.2 to 0.6
            const clusterGeometry = new THREE.IcosahedronGeometry(clusterSize, 0);
            const clusterMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 }); // Gray
            const cluster = new THREE.Mesh(clusterGeometry, clusterMaterial);
            
            // Position clusters around the base
            const angle = (i / numClusters) * Math.PI * 2;
            const radius = 0.2 + Math.random() * 0.5; // 0.2 to 0.7
            cluster.position.set(
                Math.cos(angle) * radius,
                baseHeight + Math.random() * 0.5, // 0.3 to 0.8 above base
                Math.sin(angle) * radius
            );
            
            // Squish the cluster a bit
            cluster.scale.y = 0.7 + Math.random() * 0.3;
            cluster.scale.x = 0.9 + Math.random() * 0.2;
            cluster.scale.z = 0.9 + Math.random() * 0.2;
            
            cluster.castShadow = true;
            bushGroup.add(cluster);
        }
        
        return bushGroup;
    }
    
    createWiltedTallPlant() {
        // Create a tall wilted plant (like a small tree or corn stalk)
        const tallPlantGroup = new THREE.Group();
        
        // Stem/trunk - more height variation
        const trunkHeight = 2.0 + Math.random() * 3.0; // 2.0 to 5.0 (much taller possible)
        const trunkThickness = 0.1 + Math.random() * 0.2; // 0.1 to 0.3
        const trunkGeometry = new THREE.CylinderGeometry(trunkThickness, trunkThickness * 1.3, trunkHeight, 5, 2);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true;
        
        // Use modern approach without manipulating vertices directly
        // Instead, we'll create a subtle curve by adding slightly rotated cylinders
        const numSegments = 3;
        const segmentHeight = trunkHeight / numSegments;
        
        for (let i = 1; i < numSegments; i++) {
            const segmentGeometry = new THREE.CylinderGeometry(
                trunkThickness - (i * 0.02), 
                trunkThickness - ((i-1) * 0.02), 
                segmentHeight, 
                5, 
                1
            );
            const segment = new THREE.Mesh(segmentGeometry, trunkMaterial);
            
            // Position higher up the trunk
            segment.position.y = trunkHeight/2 + (i * segmentHeight * 0.5);
            
            // Add a slight curve by moving segment
            segment.position.x = i * 0.2;
            
            // Rotate slightly to continue the curve
            segment.rotation.z = -i * 0.1;
            
            segment.castShadow = true;
            tallPlantGroup.add(segment);
        }
        
        tallPlantGroup.add(trunk);
        
        // Add wilted leaves/branches
        const numLeaves = 4 + Math.floor(Math.random() * 5); // 4-8 leaves
        
        for (let i = 0; i < numLeaves; i++) {
            // Replace cone geometry with a more natural flat, irregular leaf shape
            const leafWidth = 0.3 + Math.random() * 0.2;
            const leafHeight = 0.6 + Math.random() * 0.4;
            const leafShape = new THREE.Shape();
            
            // Create an irregular leaf shape
            leafShape.moveTo(0, 0);
            leafShape.bezierCurveTo(
                leafWidth * 0.3, leafHeight * 0.3,
                leafWidth * 0.7, leafHeight * 0.5,
                leafWidth, 0
            );
            leafShape.bezierCurveTo(
                leafWidth * 0.7, -leafHeight * 0.2,
                leafWidth * 0.3, -leafHeight * 0.1,
                0, 0
            );
            
            const leafGeometry = new THREE.ShapeGeometry(leafShape);
            const leafMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x696969, // DimGray
                side: THREE.DoubleSide
            });
            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
            
            // Position leaves along upper part of trunk
            const heightPercentage = 0.5 + (i / numLeaves) * 0.5;
            const height = trunkHeight * heightPercentage;
            const angle = (i / numLeaves) * Math.PI * 2;
            
            // Calculate the radius of the trunk at this height (trunk is tapered and curved)
            const heightRatio = height / trunkHeight;
            // Get basic trunk radius at this height
            const trunkRadiusAtHeight = trunkThickness * (1 - heightRatio) + (trunkThickness * 1.3) * heightRatio;
            
            // Account for trunk curve for leaves high up on the trunk
            const curveOffsetX = height > trunkHeight/2 ? (height - trunkHeight/2) * 0.2 : 0;
            
            leaf.position.y = height;
            // Position leaves directly at the trunk surface with the curve offset
            leaf.position.x = Math.cos(angle) * trunkRadiusAtHeight + curveOffsetX;
            leaf.position.z = Math.sin(angle) * trunkRadiusAtHeight;
            
            // Rotate leaf to look wilted and face outward
            leaf.rotation.x = Math.PI * 0.4; // Less steep angle than before
            leaf.rotation.y = Math.random() * Math.PI * 0.3 - Math.PI * 0.15; // Slight random rotation
            leaf.rotation.z = angle;
            
            leaf.castShadow = true;
            tallPlantGroup.add(leaf);
        }
        
        return tallPlantGroup;
    }
    
    createWiltedIvyPlant() {
        // Create a wilted climbing ivy plant
        const ivyGroup = new THREE.Group();
        
        // Base/root - darker, more shriveled
        const baseRadius = 0.1 + Math.random() * 0.1;
        const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.3, 0.15, 5, 1);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x4B3621 }); // Dark brown
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.075;
        base.castShadow = true;
        ivyGroup.add(base);
        
        // Main wilted vine/stem - gray colors to appear wilted
        const stemColors = [
            0x696969, // Dim Gray
            0x808080, // Gray
            0x778899, // Light Slate Gray
            0x5F9EA0, // Cadet Blue (slightly greenish gray)
        ];
        
        // Create climbing vine structure
        const numVines = 2 + Math.floor(Math.random() * 3); // 2-4 main vines
        
        for (let i = 0; i < numVines; i++) {
            // More elaborate vine with segments
            const vineHeight = 1.0 + Math.random() * 1.5; // 1.0-2.5 units
            const numSegments = 3 + Math.floor(Math.random() * 4); // 3-6 segments
            const segmentHeight = vineHeight / numSegments;
            
            const stemColor = stemColors[Math.floor(Math.random() * stemColors.length)];
            
            // Base angle for this vine
            const baseAngle = (i / numVines) * Math.PI * 2;
            
            // Create vine segments with curves
            let prevX = Math.cos(baseAngle) * 0.1;
            let prevZ = Math.sin(baseAngle) * 0.1;
            let prevY = 0.1; // Start slightly above ground
            
            for (let j = 0; j < numSegments; j++) {
                const segmentGeometry = new THREE.CylinderGeometry(0.03, 0.04, segmentHeight, 4, 1);
                const segmentMaterial = new THREE.MeshLambertMaterial({ color: stemColor });
                const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
                
                // Create a curved path for the vine
                const bendAngle = baseAngle + (Math.random() - 0.5) * 0.5;
                const bendDistance = 0.1 + (j * 0.05);
                
                const x = prevX + Math.cos(bendAngle) * bendDistance;
                const z = prevZ + Math.sin(bendAngle) * bendDistance;
                const y = prevY + segmentHeight / 2;
                
                segment.position.set(x, y, z);
                
                // Wilt/droop effect - more pronounced in upper segments
                const droopFactor = j / numSegments; // 0 to nearly 1
                segment.rotation.x = droopFactor * 0.8; // Increasing droop up the vine
                segment.rotation.z = (Math.random() - 0.5) * 0.4; // Random sideways tilt
                segment.rotation.y = bendAngle;
                
                segment.castShadow = true;
                ivyGroup.add(segment);
                
                // Save end position for next segment
                prevX = x;
                prevZ = z;
                prevY = y + segmentHeight / 2;
                
                // Add wilted leaves to each segment
                const numLeaves = 2 + Math.floor(Math.random() * 3); // 2-4 leaves per segment
                
                for (let k = 0; k < numLeaves; k++) {
                    // Create shriveled leaf
                    const leafSize = 0.1 + Math.random() * 0.1;
                    const leafShape = new THREE.Shape();
                    
                    // Shriveled heart-shaped leaf for ivy
                    leafShape.moveTo(0, leafSize);
                    leafShape.bezierCurveTo(leafSize*0.4, leafSize*0.7, leafSize*0.7, leafSize*0.4, leafSize*0.8, 0);
                    leafShape.bezierCurveTo(leafSize*0.7, -leafSize*0.4, leafSize*0.4, -leafSize*0.7, 0, -leafSize*0.8);
                    leafShape.bezierCurveTo(-leafSize*0.4, -leafSize*0.7, -leafSize*0.7, -leafSize*0.4, -leafSize*0.8, 0);
                    leafShape.bezierCurveTo(-leafSize*0.7, leafSize*0.4, -leafSize*0.4, leafSize*0.7, 0, leafSize);
                    
                    const leafGeometry = new THREE.ShapeGeometry(leafShape);
                    
                    // Gray, wilted leaf colors
                    const grayVariation = Math.random() * 0.3; // 0 to 0.3
                    const leafColor = new THREE.Color(
                        0.4 + grayVariation,
                        0.4 + grayVariation,
                        0.4 + grayVariation
                    );
                    
                    const leafMaterial = new THREE.MeshLambertMaterial({ 
                        color: leafColor,
                        side: THREE.DoubleSide
                    });
                    
                    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                    
                    // Position leaf along segment
                    const leafAngle = Math.random() * Math.PI * 2;
                    const leafDistance = 0.05 + Math.random() * 0.05;
                    const leafHeight = (k / numLeaves) * segmentHeight * 0.8;
                    
                    leaf.position.set(
                        x + Math.cos(leafAngle) * leafDistance,
                        y - segmentHeight/2 + leafHeight,
                        z + Math.sin(leafAngle) * leafDistance
                    );
                    
                    // Wilt effect on leaves - curl and droop
                    leaf.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.7; // Mostly downward
                    leaf.rotation.y = Math.random() * Math.PI * 2;
                    leaf.rotation.z = Math.random() * Math.PI * 2;
                    
                    // Shrivel effect - uneven scale
                    leaf.scale.x = 0.8 + Math.random() * 0.3;
                    leaf.scale.y = 0.6 + Math.random() * 0.3;
                    
                    leaf.castShadow = true;
                    ivyGroup.add(leaf);
                }
            }
        }
        
        return ivyGroup;
    }
    
    render() {
        // Update pastel border animation
        if (this.borderMaterial) {
            this.borderMaterial.uniforms.time.value = performance.now() * 0.001;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    // New function for creating clusters of wilted plants
    createWiltedCluster() {
        const clusterGroup = new THREE.Group();
        
        // Create 2-4 wilted plants in a small cluster
        const numPlantsInCluster = 2 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numPlantsInCluster; i++) {
            // Choose a random plant type
            const randomPlant = Math.random();
            let plant;
            
            if (randomPlant < 0.4) {
                plant = this.createWiltedPlant();
            } else if (randomPlant < 0.7) {
                plant = this.createWiltedBush();
            } else if (randomPlant < 0.9) {
                plant = this.createWiltedTallPlant();
            } else {
                plant = this.createWiltedIvyPlant();
            }
            
            // Position in a tight cluster
            const radius = 0.3 + Math.random() * 0.6;
            const angle = Math.random() * Math.PI * 2;
            plant.position.set(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );
            
            // Varied scale within the cluster
            const scale = 0.6 + Math.random() * 0.6;
            plant.scale.set(scale, scale, scale);
            
            // Random rotation
            plant.rotation.y = Math.random() * Math.PI * 2;
            
            clusterGroup.add(plant);
        }
        
        return clusterGroup;
    }
    
    updateDayNightCycle() {
        // Advance time of day
        this.timeOfDay += this.daySpeed * 0.016; // Assume ~60fps (0.016s per frame)
        if (this.timeOfDay > 1) {
            this.timeOfDay -= 1; // Loop back to start of day
        }
        
        // Update skybox uniform
        this.skyUniforms.timeOfDay.value = this.timeOfDay;
        
        // Update sun position
        const sunAngle = (this.timeOfDay * Math.PI * 2) - Math.PI/2;
        const sunDistance = 100;
        this.sunPosition.x = Math.cos(sunAngle) * sunDistance;
        this.sunPosition.y = Math.sin(sunAngle) * sunDistance;
        this.sunPosition.z = 0;
        this.sunLight.position.copy(this.sunPosition);
        
        // Update moon position (opposite to sun)
        this.moonLight.position.copy(this.sunPosition).multiplyScalar(-1);
        
        // Update light intensities and colors based on time of day
        if (this.timeOfDay > 0.2 && this.timeOfDay < 0.8) {
            // Daytime (including sunrise/sunset)
            const sunHeight = Math.sin(sunAngle);
            const baseIntensity = Math.max(0.1, sunHeight);
            
            // Ambient light changes with time of day
            this.ambientLight.intensity = Math.max(0.1, baseIntensity * 0.5);
            
            // Sun color changes at sunrise/sunset
            if (this.timeOfDay < 0.3 || this.timeOfDay > 0.7) {
                // Sunrise or sunset - warmer light
                const sunsetFactor = (this.timeOfDay < 0.3) ? 
                    1.0 - ((this.timeOfDay - 0.2) / 0.1) :
                    (this.timeOfDay - 0.7) / 0.1;
                
                const sunsetColor = new THREE.Color(1.0, 0.8, 0.5); // Warm orange
                const dayColor = new THREE.Color(1.0, 1.0, 0.9);    // Slightly warm white
                
                this.sunLight.color.copy(dayColor).lerp(sunsetColor, sunsetFactor);
                this.sunLight.intensity = Math.max(0.5, baseIntensity * 0.8);
            } else {
                // Middle of day - bright white light
                this.sunLight.color.set(0xffffff);
                this.sunLight.intensity = baseIntensity * 0.8;
            }
            
            // No moon during the day
            this.moonLight.intensity = 0;
            
            // No stars during the day
            this.stars.material.opacity = 0;
            
            // Handle day/night ambient sound transition
            if (this.audioEnabled) {
                // Transition from night to day
                if (this.timeOfDay >= 0.2 && this.timeOfDay <= 0.3) {
                    // Morning transition
                    const dayFactor = (this.timeOfDay - 0.2) / 0.1;
                    if (this.hasDayAmbient) this.dayAmbient.volume = 0.3 * dayFactor;
                    if (this.hasNightAmbient) this.nightAmbient.volume = 0.3 * (1 - dayFactor);
                    
                    // Make sure both are playing during transition
                    if (this.hasDayAmbient && this.dayAmbient.paused && this.dayAmbient.volume > 0) {
                        this.dayAmbient.play().catch(e => {});
                    }
                } else {
                    // Full daytime
                    if (this.hasDayAmbient) this.dayAmbient.volume = 0.3;
                    if (this.hasNightAmbient) this.nightAmbient.volume = 0;
                    
                    if (this.hasNightAmbient && !this.nightAmbient.paused) {
                        this.nightAmbient.pause();
                    }
                    
                    // Evening transition
                    if (this.timeOfDay >= 0.7 && this.timeOfDay <= 0.8) {
                        const nightFactor = (this.timeOfDay - 0.7) / 0.1;
                        if (this.hasDayAmbient) this.dayAmbient.volume = 0.3 * (1 - nightFactor);
                        if (this.hasNightAmbient) this.nightAmbient.volume = 0.3 * nightFactor;
                        
                        // Start night ambient during transition
                        if (this.hasNightAmbient && this.nightAmbient.paused && this.nightAmbient.volume > 0) {
                            this.nightAmbient.play().catch(e => {});
                        }
                    }
                }
            }
        } else {
            // Nighttime
            this.sunLight.intensity = 0;
            this.ambientLight.intensity = 0.1;
            this.moonLight.intensity = 0.2;
            
            // Stars get brighter at night
            const nightProgress = (this.timeOfDay > 0.8) ?
                (this.timeOfDay - 0.8) / 0.2 :
                1.0 - (this.timeOfDay / 0.2);
                
            this.stars.material.opacity = Math.min(1, nightProgress * 1.5);
            
            // Night ambient sounds
            if (this.audioEnabled) {
                if (this.hasDayAmbient) {
                    this.dayAmbient.volume = 0;
                    if (this.dayAmbient.paused === false) {
                        this.dayAmbient.pause();
                    }
                }
                
                if (this.hasNightAmbient) {
                    this.nightAmbient.volume = 0.3;
                    if (this.nightAmbient.paused) {
                        this.nightAmbient.play().catch(e => {});
                    }
                }
            }
        }
    }
    
    setupAudio() {
        // Get audio elements
        this.backgroundMusic = document.getElementById('background-music');
        this.rainSound = document.getElementById('rain-sound');
        this.plantGrowSound = document.getElementById('plant-grow-sound');
        this.dayAmbient = document.getElementById('day-ambient');
        this.nightAmbient = document.getElementById('night-ambient');
        
        // Initialize flags for audio availability and state
        this.hasBgMusic = false;
        this.hasRainSound = false;
        this.hasPlantSound = false;
        this.hasDayAmbient = false;
        this.hasNightAmbient = false;
        this.bgMusicStarted = false; // Flag to track if we've already started playing

        // Force direct loading of background music
        if (this.backgroundMusic && this.backgroundMusic.tagName === 'AUDIO') {
            console.log("Setting up background music");
            
            // Set volume before loading
            this.backgroundMusic.volume = 0.4;
            
            // Force load the audio file
            this.backgroundMusic.load();
            
            // Set up event handlers
            this.backgroundMusic.addEventListener('error', (e) => {
                console.error("Background music error:", e);
                // Try an alternative approach if the normal one fails
                this.tryAlternativeAudioLoading();
            });
            
            // Only trigger once when the audio is ready
            const onCanPlay = () => {
                console.log("Background music is ready to play");
                this.hasBgMusic = true;
                
                if (this.audioEnabled && !this.bgMusicStarted) {
                    this.tryPlayBackgroundMusic();
                }
                
                // Remove the event listener after first trigger
                this.backgroundMusic.removeEventListener('canplay', onCanPlay);
            };
            
            this.backgroundMusic.addEventListener('canplay', onCanPlay);
            
            // Check if the audio might already be loaded
            if (this.backgroundMusic.readyState >= 2) { // HAVE_CURRENT_DATA or better
                this.hasBgMusic = true;
                console.log("Background music already loaded");
                if (this.audioEnabled && !this.bgMusicStarted) {
                    this.tryPlayBackgroundMusic();
                }
            }
            
            // Force a direct play attempt after a short delay
            setTimeout(() => {
                if (this.audioEnabled && !this.bgMusicStarted) {
                    console.log("Attempting direct play of background music");
                    this.backgroundMusic.play()
                        .then(() => {
                            console.log("Direct play successful");
                            this.hasBgMusic = true;
                            this.bgMusicStarted = true;
                        })
                        .catch(e => {
                            console.warn("Direct play failed:", e);
                            // Will need user interaction
                        });
                }
            }, 1000);
        } else {
            console.warn("Background music element not found");
            // Try creating it programmatically
            this.tryAlternativeAudioLoading();
        }
        
        // Handle other audio elements - these might be missing but that's OK
        if (this.rainSound && this.rainSound.tagName === 'AUDIO') {
            this.rainSound.addEventListener('canplay', () => {
                this.hasRainSound = true;
                this.rainSound.volume = 0;
            });
        }
        
        if (this.plantGrowSound && this.plantGrowSound.tagName === 'AUDIO') {
            this.plantGrowSound.addEventListener('canplay', () => {
                this.hasPlantSound = true;
                this.plantGrowSound.volume = 0.5;
            });
        }
        
        if (this.dayAmbient && this.dayAmbient.tagName === 'AUDIO') {
            this.dayAmbient.addEventListener('canplay', () => {
                this.hasDayAmbient = true;
                this.dayAmbient.volume = 0.3;
            });
        }
        
        if (this.nightAmbient && this.nightAmbient.tagName === 'AUDIO') {
            this.nightAmbient.addEventListener('canplay', () => {
                this.hasNightAmbient = true;
                this.nightAmbient.volume = 0;
            });
        }
        
        // Setup audio toggle button
        const toggleButton = document.getElementById('toggle-audio');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                this.audioEnabled = !this.audioEnabled;
                
                if (this.audioEnabled) {
                    toggleButton.textContent = '🔊';
                    if (!this.bgMusicStarted) {
                        this.tryPlayBackgroundMusic();
                    } else if (this.hasBgMusic && this.backgroundMusic.paused) {
                        // If music was already started but is paused, just resume it
                        this.backgroundMusic.play().catch(e => {});
                    }
                    
                    // Resume ambient sounds based on time of day
                    if (this.timeOfDay > 0.2 && this.timeOfDay < 0.8) {
                        if (this.hasDayAmbient) this.dayAmbient.play().catch(e => {});
                    } else {
                        if (this.hasNightAmbient) this.nightAmbient.play().catch(e => {});
                    }
                    
                    // Resume any active rain sounds
                    if (this.hasRainSound) {
                        for (const cloud of this.clouds) {
                            if (cloud.isRaining) {
                                this.rainSound.play().catch(e => {});
                                break;
                            }
                        }
                    }
                } else {
                    toggleButton.textContent = '🔇';
                    if (this.hasBgMusic) this.backgroundMusic.pause();
                    if (this.hasRainSound) this.rainSound.pause();
                    if (this.hasDayAmbient) this.dayAmbient.pause();
                    if (this.hasNightAmbient) this.nightAmbient.pause();
                }
            });
        }
        
        // Add user interaction event listeners to start audio
        document.addEventListener('click', this.startAudioOnUserInteraction);
        document.addEventListener('keydown', this.startAudioOnUserInteraction);
        
        // Display a message to the user
        this.showFeedbackMessage("Click anywhere to enable music");
    }
    
    // Try an alternative loading approach for audio
    tryAlternativeAudioLoading() {
        // Don't try alternative loading if music is already playing
        if (this.bgMusicStarted) {
            return;
        }
        
        console.log("Trying alternative audio loading approach");
        
        // Create a new audio element programmatically to bypass range requests
        const newAudio = new Audio();
        
        // Set up event handlers before setting src
        newAudio.addEventListener('canplay', () => {
            console.log("Alternative audio loading successful");
            this.backgroundMusic = newAudio;
            this.hasBgMusic = true;
            
            if (this.audioEnabled && !this.bgMusicStarted) {
                // Try to play immediately
                newAudio.play()
                    .then(() => {
                        console.log("Alternative audio playing successfully");
                        this.bgMusicStarted = true;
                    })
                    .catch(e => console.warn("Alternative audio play failed:", e));
            }
        });
        
        newAudio.addEventListener('error', (e) => {
            console.error("Alternative audio loading also failed:", e);
            // Final fallback - try with a different approach
            if (!this.bgMusicStarted) {
                this.tryFinalAudioFallback();
            }
        });
        
        // Configure the audio
        newAudio.loop = true;
        newAudio.volume = 0.4;
        newAudio.src = 'audio/background-music.mp3';
        
        // Force load
        newAudio.load();
        
        // Try playing after a short delay
        setTimeout(() => {
            if (this.audioEnabled && !this.bgMusicStarted) {
                newAudio.play()
                    .then(() => {
                        console.log("Delayed alternative audio playing successfully");
                        this.bgMusicStarted = true;
                    })
                    .catch(e => console.warn("Delayed alternative audio play failed:", e));
            }
        }, 1000);
    }
    
    // Final fallback for audio loading
    tryFinalAudioFallback() {
        // Don't try final fallback if music is already playing
        if (this.bgMusicStarted) {
            return;
        }
        
        console.log("Trying final audio fallback approach");
        
        // Create an audio context
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext();
            
            // Fetch the audio file directly
            fetch('audio/background-music.mp3')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.arrayBuffer();
                })
                .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
                .then(audioBuffer => {
                    // Don't proceed if music has started playing through another method
                    if (this.bgMusicStarted) {
                        return;
                    }
                    
                    console.log("Audio loaded via Web Audio API");
                    
                    // Create a buffer source node
                    const source = audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.loop = true;
                    
                    // Create a gain node for volume control
                    const gainNode = audioContext.createGain();
                    gainNode.gain.value = 0.4;
                    
                    // Connect the nodes
                    source.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    
                    // Start playback
                    source.start();
                    
                    // Store references
                    this.webAudioSource = source;
                    this.webAudioGain = gainNode;
                    this.webAudioContext = audioContext;
                    this.hasBgMusic = true;
                    this.bgMusicStarted = true;
                    
                    console.log("Web Audio API playback started");
                    this.showFeedbackMessage("Music enabled");
                })
                .catch(e => {
                    console.error("Web Audio API approach failed:", e);
                    this.showFeedbackMessage("Could not play music");
                });
        } catch (e) {
            console.error("Web Audio API not supported:", e);
            this.showFeedbackMessage("Music not supported in this browser");
        }
    }
    
    // Separated as a method to ensure 'this' context is preserved
    startAudioOnUserInteraction = () => {
        console.log("User interaction detected - attempting to play audio");
        
        if (this.audioEnabled) {
            // Try multiple approaches to play background music
            if (this.hasBgMusic && !this.bgMusicStarted) {
                this.tryPlayBackgroundMusic();
            } else if (this.hasBgMusic && this.backgroundMusic.paused) {
                // If music was already started but is paused, just resume it
                this.backgroundMusic.play().catch(e => {});
            } else if (!this.hasBgMusic && !this.bgMusicStarted) {
                // If we don't have background music yet, try loading it directly
                console.log("Background music not ready yet, trying direct approach");
                this.tryAlternativeAudioLoading();
            }
            
            // Try ambient sounds too
            if (this.hasDayAmbient && this.timeOfDay > 0.2 && this.timeOfDay < 0.8) {
                this.dayAmbient.play().catch(e => {});
            } else if (this.hasNightAmbient) {
                this.nightAmbient.play().catch(e => {});
            }
        }
        
        // Show feedback to the user
        this.showFeedbackMessage("Music enabled");
        
        // Remove event listeners after first interaction
        document.removeEventListener('click', this.startAudioOnUserInteraction);
        document.removeEventListener('keydown', this.startAudioOnUserInteraction);
    }
    
    // Helper method to safely try playing background music
    tryPlayBackgroundMusic() {
        if (this.hasBgMusic && this.audioEnabled && !this.bgMusicStarted) {
            console.log("Attempting to play background music");
            
            // Clear any current timeouts
            if (this.bgMusicTimeout) {
                clearTimeout(this.bgMusicTimeout);
            }
            
            // Try playing immediately
            this.backgroundMusic.play()
                .then(() => {
                    console.log("Background music playing successfully");
                    this.bgMusicStarted = true; // Mark as started
                    
                    // Double-check it's actually playing
                    if (this.backgroundMusic.paused) {
                        console.warn("Music reported success but is still paused!");
                        // Try again with a timeout
                        setTimeout(() => this.backgroundMusic.play(), 500);
                    }
                })
                .catch(e => {
                    console.warn("Could not play background music:", e);
                    
                    // Try again with a timeout only if we haven't started yet
                    if (!this.bgMusicStarted) {
                        this.bgMusicTimeout = setTimeout(() => {
                            if (!this.bgMusicStarted) { // Double-check we still need to try
                                console.log("Retrying background music playback");
                                this.backgroundMusic.play()
                                    .then(() => {
                                        console.log("Delayed play successful");
                                        this.bgMusicStarted = true;
                                    })
                                    .catch(e => {
                                        console.warn("Delayed play also failed:", e);
                                        // Last resort - create a new audio element
                                        if (!this.retriedAlternative && !this.bgMusicStarted) {
                                            this.retriedAlternative = true;
                                            this.tryAlternativeAudioLoading();
                                        }
                                    });
                            }
                        }, 1000);
                    }
                });
        } else if (this.hasBgMusic && this.audioEnabled && this.bgMusicStarted && this.backgroundMusic.paused) {
            // If music was already started but is paused, just resume it
            this.backgroundMusic.play().catch(e => {});
        } else {
            console.warn("Cannot play background music - not available, already playing, or audio disabled");
        }
    }
    
    createRainbow(startPosition, endPosition) {
        // Create a rainbow arc between two positions
        const segments = 20;
        const radius = 15;
        const thickness = 0.5;
        const arcAngle = Math.PI * 0.5; // Half circle
        
        // Create rainbow colors
        const rainbowColors = [
            0xFF0000, // Red
            0xFF7F00, // Orange
            0xFFFF00, // Yellow
            0x00FF00, // Green
            0x0000FF, // Blue
            0x4B0082, // Indigo
            0x9400D3  // Violet
        ];
        
        const rainbowGroup = new THREE.Group();
        
        // Create each color band
        for (let i = 0; i < rainbowColors.length; i++) {
            const bandRadius = radius - (i * thickness);
            const curve = new THREE.EllipseCurve(
                0, 0,                         // Center
                bandRadius, bandRadius,       // X and Y radius
                Math.PI, Math.PI + arcAngle,  // Start and end angle
                false,                        // Clockwise
                0                             // Rotation
            );
            
            const points = curve.getPoints(segments);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            
            // Create a line for the rainbow band
            const material = new THREE.LineBasicMaterial({ 
                color: rainbowColors[i],
                linewidth: 3,
                transparent: true,
                opacity: 0.7
            });
            
            const band = new THREE.Line(geometry, material);
            band.rotateX(Math.PI / 2); // Rotate to be vertical
            rainbowGroup.add(band);
        }
        
        // Position the rainbow
        const direction = new THREE.Vector3().subVectors(endPosition, startPosition).normalize();
        const distance = startPosition.distanceTo(endPosition);
        
        rainbowGroup.position.copy(startPosition);
        rainbowGroup.lookAt(endPosition);
        rainbowGroup.rotateX(Math.PI / 2); // Adjust orientation
        
        // Add to scene
        this.scene.add(rainbowGroup);
        
        // Animate rainbow appearance and disappearance
        const startTime = Date.now();
        const duration = 10000; // 10 seconds
        
        const animateRainbow = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            
            if (progress >= 1) {
                // Animation complete, remove rainbow
                this.scene.remove(rainbowGroup);
                return;
            }
            
            // Fade in and out
            let opacity;
            if (progress < 0.2) {
                // Fade in
                opacity = progress / 0.2;
            } else if (progress > 0.8) {
                // Fade out
                opacity = (1 - progress) / 0.2;
            } else {
                // Full opacity
                opacity = 1;
            }
            
            // Apply opacity to all bands
            rainbowGroup.children.forEach(band => {
                band.material.opacity = opacity * 0.7;
            });
            
            // Continue animation
            requestAnimationFrame(animateRainbow);
        };
        
        // Start animation
        animateRainbow();
        
        return rainbowGroup;
    }
    
    createLightning(startPosition, endPosition) {
        // Create a lightning bolt between two positions
        const segments = 10;
        const maxDeviation = 2;
        const boltWidth = 0.2;
        
        // Create points for the lightning path
        const points = [];
        points.push(startPosition.clone());
        
        // Create jagged path between start and end
        const direction = new THREE.Vector3().subVectors(endPosition, startPosition);
        const segmentLength = direction.length() / segments;
        const normalizedDirection = direction.clone().normalize();
        
        // Create perpendicular vectors for random deviations
        const perpVector1 = new THREE.Vector3(-normalizedDirection.z, 0, normalizedDirection.x).normalize();
        const perpVector2 = new THREE.Vector3().crossVectors(normalizedDirection, perpVector1).normalize();
        
        for (let i = 1; i < segments; i++) {
            // Calculate position along the path
            const basePoint = new THREE.Vector3().copy(startPosition).add(
                normalizedDirection.clone().multiplyScalar(segmentLength * i)
            );
            
            // Add random deviation
            const deviation1 = (Math.random() - 0.5) * maxDeviation;
            const deviation2 = (Math.random() - 0.5) * maxDeviation;
            
            basePoint.add(perpVector1.clone().multiplyScalar(deviation1));
            basePoint.add(perpVector2.clone().multiplyScalar(deviation2));
            
            points.push(basePoint);
        }
        
        // Add end position
        points.push(endPosition.clone());
        
        // Create geometry from points
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Create material with glow effect
        const material = new THREE.LineBasicMaterial({
            color: 0x80f0ff,
            linewidth: 3,
            transparent: true,
            opacity: 0.8
        });
        
        const lightning = new THREE.Line(geometry, material);
        this.scene.add(lightning);
        
        // Create a point light at the end of the lightning
        const lightningLight = new THREE.PointLight(0x80f0ff, 2, 20);
        lightningLight.position.copy(endPosition);
        this.scene.add(lightningLight);
        
        // Flash effect
        const flashDuration = 200; // milliseconds
        const flashCount = 3;
        let currentFlash = 0;
        
        const flash = () => {
            // Toggle visibility
            lightning.visible = !lightning.visible;
            lightningLight.visible = !lightningLight.visible;
            
            currentFlash++;
            
            if (currentFlash < flashCount * 2) {
                // Continue flashing
                setTimeout(flash, flashDuration / (currentFlash + 1)); // Faster flashes
            } else {
                // Remove after flashing
                setTimeout(() => {
                    this.scene.remove(lightning);
                    this.scene.remove(lightningLight);
                }, 100);
            }
        };
        
        // Start flashing
        flash();
        
        return lightning;
    }
}

// Initialize game when the page has loaded
window.addEventListener('load', () => {
    new CloudWizard();
}); 