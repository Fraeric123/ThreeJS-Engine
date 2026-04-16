


export class Instance {
    constructor(engine, gameScene) {
        this.engine = engine;
        this.gameScene = gameScene;
        this.scene = gameScene.scene;
        this.world = gameScene.world;

        this.object3D = null;
        this.rigidBody = null;
    }

    sync_with_physics(alpha = 1) {
        if (!this.object3D || !this.rigidBody) return;
        const pos = this.rigidBody.translation();
        const rot = this.rigidBody.rotation();
        this.object3D.position.set(pos.x, pos.y, pos.z);
        this.object3D.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }

    init() { }
    update(dt) { }

    duplicate(gameScene, newOptions = {}) {
        const mergedOptions = { ...this.options, ...newOptions };

        const id = "copy_" + Math.random().toString(16).slice(2);

        return gameScene.add_instance(id, this.constructor, mergedOptions);
    }

    destroy() {
        if (this.rigidBody) {
            this.world.removeRigidBody(this.rigidBody);
            this.rigidBody = null;
        }

        if (this.object3D) {
            this.scene.remove(this.object3D);
            this.object3D = null;
        }
    }
}

export class Player extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);
        this.walkSpeed = 5;
        this.sprintSpeed = 8;
        this.crouchSpeed = 2.5;
        this.jumpForce = 7;

        this.radius = 0.4;
        this.standHeight = 1.2;
        this.crouchHeight = 0.6;
        this.bobIntensity = 0;

        this.currentVisualHeight = this.standHeight;

        this.isCrouching = false;
        this.leanOffset = 0;
        this.bobTime = 0;
        this.isMoving = false;
    }

    init() {
        const rbDesc = this.engine.rapier.RigidBodyDesc.dynamic()
            .setTranslation(0, 5, 0)
            .lockRotations()
            .setLinearDamping(0.5);

        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.createCollider(this.standHeight);
    }

    createCollider(height) {
        if (this.collider) this.world.removeCollider(this.collider, true);
        const colliderDesc = this.engine.rapier.ColliderDesc.capsule(height / 2, this.radius)
            .setFriction(0.0);
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);
    }

    update(dt) {
        if (this.engine.engine_mode !== "game") return;

        const input = this.engine.input;
        const velocity = this.rigidBody.linvel();

        if (input.crouch && !this.isCrouching) {
            this.isCrouching = true;
            this.createCollider(this.crouchHeight);
        } else if (!input.crouch && this.isCrouching) {
            this.isCrouching = false;
            this.createCollider(this.standHeight);
        }

        const targetVisualHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
        this.currentVisualHeight = this.engine.THREE.MathUtils.lerp(
            this.currentVisualHeight,
            targetVisualHeight,
            0.1
        );

        let isSprinting = input.sprint && !this.isCrouching && input.forward;
        let currentSpeed = this.isCrouching ? this.crouchSpeed : (isSprinting ? this.sprintSpeed : this.walkSpeed);

        const yaw = this.engine.look.yaw;
        const forward = new this.engine.THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new this.engine.THREE.Vector3().crossVectors(forward, new this.engine.THREE.Vector3(0, 1, 0));

        let moveX = 0, moveZ = 0;
        if (input.forward) { moveX += forward.x; moveZ += forward.z; }
        if (input.back) { moveX -= forward.x; moveZ -= forward.z; }
        if (input.left) { moveX -= right.x; moveZ -= right.z; }
        if (input.right) { moveX += right.x; moveZ += right.z; }

        const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
        this.isMoving = length > 0.1;

        if (this.isMoving) {
            this.rigidBody.setLinvel({
                x: (moveX / length) * currentSpeed,
                y: velocity.y,
                z: (moveZ / length) * currentSpeed
            }, true);

            const speedFactor = isSprinting ? 1.5 : (this.isCrouching ? 0.6 : 1.0);
            this.bobTime += dt * currentSpeed * speedFactor;
        } else {
            this.rigidBody.setLinvel({ x: 0, y: velocity.y, z: 0 }, true);
            this.bobTime += dt * this.walkSpeed;
        }

        if (input.up && Math.abs(velocity.y) < 0.05 && !this.isCrouching) {
            this.rigidBody.applyImpulse({ x: 0, y: this.jumpForce, z: 0 }, true);
        }
    }
}

export class AnimatedCharacter extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);

        this.options = options;
        this.modelName = options.model;
        this.position = options.position ?? { x: 0, y: 0, z: 0 };
        this.size = options.size ?? { x: 1, y: 1, z: 1 };
        this.scale = options.scale ?? 1;

        this.mixer = null;
        this.actions = new Map();
        this.currentAction = null;

        this.radius = options.radius ?? 0.4;
        this.height = options.height ?? 1.2;

        this.visualOffset = new this.engine.THREE.Vector3(
            options.offsetX ?? 0,
            options.offsetY ?? -(this.height / 2 + this.radius),
            options.offsetZ ?? 0
        );

        this.enableRootMotion = options.enableRootMotion ?? false;

        this.rootDefaultPositions = new Map();
        this.rootDefaultQuaternions = new Map();
        this.currentRootAxes = { x: true, y: false, z: true, rot: true };
    }

    sync_with_physics(alpha = 1) {
        if (!this.object3D || !this.rigidBody) return;
        const pos = this.rigidBody.translation();
        const rot = this.rigidBody.rotation();

        this.object3D.position.set(pos.x, pos.y, pos.z);
        this.object3D.quaternion.set(rot.x, rot.y, rot.z, rot.w);

        this.object3D.position.x += this.visualOffset.x;
        this.object3D.position.y += this.visualOffset.y;
        this.object3D.position.z += this.visualOffset.z;
    }

    init() {
        if (this.object3D) return;

        const asset = this.engine.get_model(this.modelName);
        if (!asset) return;

        this.object3D = this.engine.clone(asset.scene);
        this.scene.add(this.object3D);

        this.object3D.scale.set(this.size.x * this.scale, this.size.y * this.scale, this.size.z * this.scale);

        this.object3D.traverse(obj => {
            if (obj.isBone) {
                const name = obj.name.toLowerCase();
                if (name.includes('root') || name.includes('hips') || name.includes('pelvis')) {
                    this.rootDefaultPositions.set(obj.uuid, obj.position.clone());
                    this.rootDefaultQuaternions.set(obj.uuid, obj.quaternion.clone());
                }
            }
        });

        this.object3D.castShadow = true;
        this.object3D.receiveShadow = true;

        this.mixer = new this.engine.THREE.AnimationMixer(this.object3D);
        asset.animations.forEach(clip => {
            const action = this.mixer.clipAction(clip);
            this.actions.set(clip.name, action);
        });

        console.log("Available animations:", Array.from(this.actions.keys()));

        this.playAnimation(this.options.defaultAnimation ?? asset.animations[29]?.name);

        if (this.engine.gui) {
            if (!this.engine.charFolder) {
                this.engine.charFolder = this.engine.gui.addFolder("Characters");
                this.engine.charFolder.close();
            }
            const folder = this.engine.charFolder.addFolder(this.modelName);
            folder.close();

            const animationNames = Array.from(this.actions.keys());
            if (animationNames.length > 0) {
                const animSettings = {
                    current: this.currentAction ? this.currentAction.getClip().name : animationNames[0]
                };

                folder.add(animSettings, 'current', animationNames)
                    .name('Animation')
                    .onChange((name) => {
                        this.playAnimation(name);
                    });
            }

            folder.add(this, 'enableRootMotion').name('Enable Root Motion');
            const axisFolder = folder.addFolder('Root Motion Axes');
            axisFolder.add(this.currentRootAxes, 'x').name('Allow X (Side)');
            axisFolder.add(this.currentRootAxes, 'y').name('Allow Y (Up)');
            axisFolder.add(this.currentRootAxes, 'z').name('Allow Z (Forward)');
            axisFolder.add(this.currentRootAxes, 'rot').name('Allow Rotation');
            axisFolder.close();

            folder.add(this.visualOffset, 'x', -5.0, 5.0).name('Offset X');
            folder.add(this.visualOffset, 'y', -5.0, 5.0).name('Offset Y');
            folder.add(this.visualOffset, 'z', -5.0, 5.0).name('Offset Z');

            folder.add(this, 'scale', 0.1, 5).name('Scale').onChange(() => {
                this.object3D.scale.set(
                    this.size.x * this.scale,
                    this.size.y * this.scale,
                    this.size.z * this.scale
                );
            });
        }

        const rbDesc = this.engine.rapier.RigidBodyDesc.dynamic()
            .setTranslation(this.position.x, this.position.y, this.position.z)
            .lockRotations();

        this.rigidBody = this.world.createRigidBody(rbDesc);
        const colliderDesc = this.engine.rapier.ColliderDesc.capsule(this.height / 2, this.radius);
        this.world.createCollider(colliderDesc, this.rigidBody);
    }

    playAnimation(name, animOptions = {}) {
        const duration = animOptions.duration ?? 0.2;

        this.currentRootAxes = {
            x: animOptions.rootAxes?.x ?? false,
            y: animOptions.rootAxes?.y ?? false,
            z: animOptions.rootAxes?.z ?? false,
            rot: animOptions.rootAxes?.rot ?? false
        };

        const newAction = this.actions.get(name);
        if (!newAction || this.currentAction === newAction) return;

        if (this.currentAction) this.currentAction.fadeOut(duration);

        newAction.reset().fadeIn(duration).play();
        this.currentAction = newAction;
    }

    update(dt) {
        if (this.mixer) {
            this.mixer.update(dt);

            if (!this.enableRootMotion) {
                this.object3D.traverse(obj => {
                    if (obj.isBone && this.rootDefaultPositions.has(obj.uuid)) {
                        const defaultPos = this.rootDefaultPositions.get(obj.uuid);
                        const defaultQuat = this.rootDefaultQuaternions.get(obj.uuid);
                        const axes = this.currentRootAxes;

                        // Pokud osa není explicitně povolena v animaci, vynutíme výchozí pozici
                        if (!axes.x) obj.position.x = defaultPos.x;
                        if (!axes.y) obj.position.y = defaultPos.y;
                        if (!axes.z) obj.position.z = defaultPos.z;
                        if (!axes.rot) obj.quaternion.copy(defaultQuat);
                    }
                });
            }
        }

        this.sync_with_physics();

        if (this.object3D) {
            this.object3D.position.x += this.visualOffset.x;
            this.object3D.position.y += this.visualOffset.y - (this.height / 2 + this.radius);
            this.object3D.position.z += this.visualOffset.z;
        }

    }
}

export class BoxInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);

        this.options = options;
        this.size = options.size ?? { x: 1, y: 1, z: 1 };
        this.position = options.position ?? { x: 0, y: 5, z: 0 };

        // physics properties
        this.static = options.static ?? false;
        this.friction = options.friction ?? 0.5;
        this.restitution = options.restitution ?? 0.1;
        this.density = options.density ?? 1;
        this.linearDamping = options.linearDamping ?? 0.01;
        this.angularDamping = options.angularDamping ?? 0.01;
        this.allowSleep = options.allowSleep ?? true;
        this.sleeping = options.sleeping ?? false;

        // texturing
        this.color = options.color ?? null;
        this.diffuseTexture = options.diffuseTexture ?? null;
        this.metalnessTexture = options.metalnessTexture ?? null;
        this.roughnessTexture = options.roughnessTexture ?? null;
        this.normalTexture = options.normalTexture ?? null;
        this.emissiveTexture = options.emissiveTexture ?? null;
    }

    init() {
        if (this.object3D) return;
        const geo = new this.engine.THREE.BoxGeometry(
            this.size.x,
            this.size.y,
            this.size.z
        );
        geo.computeTangents();

        const mat = new this.engine.THREE.MeshStandardMaterial({
            color: this.color,
            map: this.diffuseTexture ? this.engine.get_texture(this.diffuseTexture) : null,
            metalnessMap: this.metalnessTexture ? this.engine.get_texture(this.metalnessTexture) : null,
            roughnessMap: this.roughnessTexture ? this.engine.get_texture(this.roughnessTexture) : null,
            normalMap: this.normalTexture ? this.engine.get_texture(this.normalTexture) : null,
            emissiveMap: this.emissiveTexture ? this.engine.get_texture(this.emissiveTexture) : null
        });


        this.object3D = new this.engine.THREE.Mesh(geo, mat);
        this.object3D.castShadow = true;
        this.object3D.receiveShadow = true;
        this.scene.add(this.object3D);

        const rbDesc = this.static ?
            this.engine.rapier.RigidBodyDesc.fixed() :
            this.engine.rapier.RigidBodyDesc.dynamic();

        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z)
            .setLinearDamping(this.linearDamping)
            .setAngularDamping(this.angularDamping)
            .setCanSleep(this.allowSleep);

        if (this.sleeping) rbDesc.setSleeping(true);

        this.rigidBody = this.world.createRigidBody(rbDesc);

        const collider = this.engine.rapier.ColliderDesc.cuboid(
            this.size.x / 2,
            this.size.y / 2,
            this.size.z / 2
        )
            .setFriction(this.friction)
            .setRestitution(this.restitution)
            .setDensity(this.density);

        this.world.createCollider(collider, this.rigidBody);
    }


    update(dt) {
        if (!this.static) {
            this.sync_with_physics();
        }
    }
}

export class GameScene {
    constructor(engine) {
        this.engine = engine;

        this.scene = new engine.THREE.Scene();

        const hemisphere = new engine.THREE.HemisphereLight(0xcfe7ff, 0x4a3f2b, 0.9);
        this.scene.add(hemisphere);

        const ambient = new engine.THREE.AmbientLight(0xffffff, 0.25);
        this.scene.add(ambient);

        const sun = new engine.THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(14, 22, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.setScalar(2048);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 90;
        const shadowSize = 30;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowSize;
        sun.shadow.camera.right = sun.shadow.camera.top = shadowSize;
        this.scene.add(sun);

        this.camera = new engine.THREE.PerspectiveCamera(
            75,
            engine.width / engine.height,
            0.1,
            1000
        );

        this.camera_speed = 1;
        this.targetZoom = 1.0;
        this.zoomSmoothness = 0.1;
        this.defaultFOV = 75;
        this.targetFOV = 75;
        this.zoomLevel = 1.0;

        const camFolder = this.engine.gui.addFolder('Camera');
        camFolder.add(this, 'camera_speed', 0.1, 2).name('Camera Speed');
        camFolder.add(this.camera, 'near', 0.01, 100).name('Camera Near').onChange(() => this.camera.updateProjectionMatrix());
        camFolder.add(this.camera, 'far', 0.01, 1000).name('Camera Far').onChange(() => this.camera.updateProjectionMatrix());
        camFolder.add(this.camera, 'zoom', 0.1, 5).name('Camera Zoom').onChange(() => this.camera.updateProjectionMatrix());
        camFolder.close();

        this.cameraType = "noclip";
        this.cameraTarget = null;

        this.camera.rotation.order = 'YXZ';

        this.listener = new engine.THREE.AudioListener();
        this.camera.add(this.listener);

        this.camera.position.set(0, 2, 8);
        this.camera.lookAt(0, 0, 0);

        this.world = new engine.rapier.World({ x: 0, y: -9.81, z: 0 });

        // --- DEBUG RENDERING ---
        this.debugEnabled = true;
        this.debugMesh = new engine.THREE.LineSegments(
            new engine.THREE.BufferGeometry(),
            new engine.THREE.LineBasicMaterial({ color: 0xff0000, vertexColors: false })
        );
        this.debugMesh.frustumCulled = false;
        this.scene.add(this.debugMesh);

        this.running = true;
        this.instances = new Map();
    }

    render(alpha, renderDt) {
        const raycaster = new this.engine.THREE.Raycaster();
        raycaster.setFromCamera(this.engine.mouse, this.camera);

        const intersects = raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            const hit = intersects[0];

            if (this.bokehPass) {
                this.bokehPass.uniforms.focus.value = this.engine.THREE.MathUtils.lerp(
                    this.bokehPass.uniforms.focus.value,
                    hit.distance,
                    0.1
                );
            }

            let targetObject = hit.object;
            while (targetObject.parent && targetObject.parent !== this.scene) {
                targetObject = targetObject.parent;
            }

            if (this.engine.outlinePass) {
                this.engine.outlinePass.selectedObjects = [targetObject];
            }
        } else {
            if (this.engine.outlinePass) {
                this.engine.outlinePass.selectedObjects = [];
            }
        }
        if (Math.abs(this.camera.fov - this.targetFOV) > 0.1) {
            this.camera.fov = this.engine.THREE.MathUtils.lerp(this.camera.fov, this.targetFOV, 0.15);
            this.camera.updateProjectionMatrix();
        }

        this.camera.rotation.y = this.engine.look.yaw;
        this.camera.rotation.x = this.engine.look.pitch;

        if (this.engine.engine_mode === "game") {
            const player = this.get_instance("player_controller");
            if (player && player.rigidBody) {
                const pos = player.rigidBody.translation();

                let bobX = Math.cos(player.bobTime * 0.5) * 0.05 * player.bobIntensity;
                let bobY = Math.sin(player.bobTime) * 0.08 * player.bobIntensity;
                let bobZ = 0;

                const leanVisualOffset = player.leanOffset * 0.4;
                const yaw = this.engine.look.yaw;

                this.camera.position.set(
                    pos.x + bobX + (Math.cos(yaw) * leanVisualOffset),
                    pos.y + (player.currentVisualHeight * 0.5) + bobY,
                    pos.z + (Math.sin(yaw) * leanVisualOffset)
                );

                this.camera.rotation.z = player.leanOffset * 0.05;
            }
        } else {
            this.camera.rotation.z = 0;
            const baseSpeed = this.engine.input.sprint ? 20 : 10;
            const speed = baseSpeed * renderDt * this.camera_speed;

            const forward = new this.engine.THREE.Vector3(
                -Math.sin(this.camera.rotation.y),
                0,
                -Math.cos(this.camera.rotation.y)
            );
            const right = new this.engine.THREE.Vector3().crossVectors(forward, this.camera.up);

            if (this.engine.input.forward) this.camera.position.addScaledVector(forward, speed);
            if (this.engine.input.back) this.camera.position.addScaledVector(forward, -speed);
            if (this.engine.input.left) this.camera.position.addScaledVector(right, -speed);
            if (this.engine.input.right) this.camera.position.addScaledVector(right, speed);
            if (this.engine.input.up) this.camera.position.y += speed;
            if (this.engine.input.crouch) this.camera.position.y -= speed;
        }


        if (this.debugEnabled) {
            const { vertices, colors } = this.world.debugRender();
            this.debugMesh.geometry.setAttribute('position', new this.engine.THREE.BufferAttribute(vertices, 3));
            this.debugMesh.geometry.setAttribute('color', new this.engine.THREE.BufferAttribute(colors, 4));
            this.debugMesh.visible = true;
        } else {
            this.debugMesh.visible = false;
        }

        for (const instance of this.instances.values()) {
            instance.sync_with_physics(alpha);
        }
    }


    // skybox functions

    set_hdri(name, exposure = 1.0) {
        const hdri = this.engine.get_hdri(name);
        if (!hdri) return;
        this.scene.background = hdri;
        this.scene.environment = hdri;
        this.engine.renderer.toneMappingExposure = exposure;
    }


    // instance management

    add_instance(name, InstanceClass, params = {}) {
        const instance = new InstanceClass(this.engine, this, params);
        this.instances.set(name, instance);
        instance.init();
        return instance;
    }

    remove_instance(name) {
        const instance = this.instances.get(name);
        if (!instance) return;

        instance.destroy();
        this.instances.delete(name);
    }

    get_instance(name) {
        return this.instances.get(name);
    }


    // lifecycle

    init() {
        for (const instance of this.instances.values()) {
            instance.init();
        }
    }

    update(dt) {
        if (!this.running) return;

        if (this.cameraTarget) {
            this.camera.position.lerp(this.cameraTarget.position, 0.1);
        }

        if (this.engine.input.zoomHeld) {
            const baseZoomFOV = 20;
            if (this.engine.look.zoomDelta !== 0) {
                this.zoomLevel += this.engine.look.zoomDelta * 2.0;
                this.zoomLevel = this.engine.THREE.MathUtils.clamp(this.zoomLevel, 1.0, 10.0);
                this.engine.look.zoomDelta = 0;
            }

            this.targetFOV = baseZoomFOV / this.zoomLevel;
        } else {
            this.targetFOV = this.defaultFOV;
            this.zoomLevel = 1.0;
            this.engine.look.zoomDelta = 0;
        }

        for (const instance of this.instances.values()) {
            instance.update(dt);
        }
    }

    destroy() {
        for (const instance of this.instances.values()) {
            instance.destroy();
        }
    }
}

export class Engine {
    constructor({ rapier, THREE, GLTFLoader, RGBELoader, clone, gui, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, BokehPass, SSAOPass, SMAAPass, OutlinePass }) {

        //libs
        this.rapier = rapier;
        this.THREE = THREE;
        this.RGBELoader = RGBELoader;
        this.clone = clone; // clone from SkeletonUtils
        this.gui = new gui();

        // loaders
        this.textureLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();
        this.audioLoader = new THREE.AudioLoader();
        this.hdrLoader = new RGBELoader();

        // postprocessing
        this.EffectComposer = EffectComposer;
        this.RenderPass = RenderPass;
        this.UnrealBloomPass = UnrealBloomPass;
        this.OutputPass = OutputPass;
        this.BokehPass = BokehPass;
        this.SSAOPass = SSAOPass;
        this.SMAAPass = SMAAPass;
        this.OutlinePass = OutlinePass;


        // init settings
        this.display_mode = 'normal_canvas';

        // canvas variables
        this.canvas2D = null;
        this.ctx2D = null;
        this.canvas3D = null;

        // render variables
        this.aspect = 16 / 9;
        this.renderWidth = 2560;
        this.renderHeight = 1440;
        this.fps = 0;

        // main variables
        this.scenes = new Map();
        this.activeScene = null;
        this.renderer = null;
        this.engine_mode = "game"; // "editor" or "game"
        this.mouse = new this.THREE.Vector2();

        // assets
        this.assets = {
            textures: new Map(),
            sounds: new Map(),
            models: new Map(),
            hdris: new Map()
        }
        this.loadingContainer = null;
        this.loadingBar = null;
        this.statusText = null;

        // event listeners
        window.addEventListener('resize', () => this.resize_canvas());
        window.addEventListener('click', () => {
            if (this.THREE.AudioContext.getContext().state === 'suspended') {
                console.log("Resuming audio context...");
                this.THREE.AudioContext.getContext().resume();
            }
        }, { once: true });

        // input setup
        this.input = {
            forward: false,
            back: false,
            left: false,
            right: false,
            leanLeft: false,
            leanRight: false,
            sprint: false,
            up: false,
            crouch: false,
            zoomHeld: false
        };
        this.look = {
            yaw: 0, pitch: 0, sensitivity: 0.0022, locked: false, zoomDelta: 0
        };
        const setKey = (code, state) => {
            const keyMap = {
                'KeyW': 'forward',
                'KeyS': 'back',
                'KeyA': 'left',
                'KeyD': 'right',
                'KeyQ': 'leanLeft',
                'KeyE': 'leanRight',
                'ShiftLeft': 'sprint',
                'ShiftRight': 'sprint',
                'KeyC': 'zoomHeld',
                'Space': 'up',
                'ControlLeft': 'crouch',
                'ControlRight': 'crouch'
            };
            if (keyMap[code]) this.input[keyMap[code]] = state;
        };
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === "w") {
                e.preventDefault();
            }
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
            }
            if (e.ctrlKey && e.key === "a") {
                e.preventDefault();
            }
            if (e.ctrlKey && e.key === "d") {
                e.preventDefault();
            }
            if (e.code === 'F2') {
                e.preventDefault();
                if (this.activeScene) {
                    this.activeScene.debugEnabled = !this.activeScene.debugEnabled;
                }
            }
            if (e.code === 'F4') {
                e.preventDefault();
                this.engine_mode = this.engine_mode === "game" ? "editor" : "game";
                console.log("Režim změněn na:", this.engine_mode);

                if (this.engine_mode === "game") {
                    this.canvas2D.requestPointerLock();
                }
            }
            if (e.code === 'Space') {
                e.preventDefault();
            }
            setKey(e.code, true);
        });
        window.addEventListener('beforeunload', (e) => {
            // e.preventDefault();
        });
        window.addEventListener('keyup', (e) => setKey(e.code, false));
        window.addEventListener('wheel', (e) => {
            if (this.input.zoomHeld) {
                this.look.zoomDelta -= e.deltaY * 0.001;
            }
        }, { passive: true });
        document.addEventListener('mousemove', (e) => {
            if (!this.look.locked) {
                const rect = this.canvas2D.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            } else {
                let sens = this.look.sensitivity;
                if (this.activeScene && this.activeScene.camera) {
                    sens *= (this.activeScene.camera.fov / 75);
                }

                this.look.yaw -= e.movementX * sens;
                this.look.pitch -= e.movementY * sens;

                this.look.pitch = this.THREE.MathUtils.clamp(
                    this.look.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01
                );
            }
        }
        );
    }


    // canvas functions

    resize_canvas() {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const windowAspect = windowWidth / windowHeight;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        let width, height;

        if (windowAspect > this.aspect) {
            height = windowHeight;
            width = height * this.aspect;
        } else {
            width = windowWidth;
            height = width / this.aspect;
        }

        this.width = width;
        this.height = height;


        [this.canvas3D, this.canvas2D].forEach(canvas => {
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            canvas.width = Math.floor(width * this.dpr);
            canvas.height = Math.floor(height * this.dpr);
        });

        const scaleX = this.width / this.renderWidth;
        const scaleY = this.height / this.renderHeight;

        if (this.renderer) {
            this.renderer.setSize(this.width, this.height, false);
            this.renderer.setPixelRatio(this.dpr);
        }

        if (this.activeScene && this.activeScene.camera) {
            this.activeScene.camera.aspect = this.width / this.height;
            this.activeScene.camera.updateProjectionMatrix();
        }

        if (this.composer) {
            this.composer.setSize(this.width, this.height);
        }

        this.ctx2D.setTransform(
            this.dpr * scaleX, 0,
            0, this.dpr * scaleY,
            0, 0
        );
    }

    drawRect(x, y, w, h, style = "white", opacity = 1, rotation = 0) {
        this.ctx2D.save();
        this.ctx2D.translate(x, this.renderHeight - y);
        this.ctx2D.rotate(rotation * Math.PI / 180);
        this.ctx2D.globalAlpha = opacity;
        this.ctx2D.fillStyle = style;
        this.ctx2D.fillRect(-w / 2, -h / 2, w, h);
        this.ctx2D.restore();
    }

    drawImg(x, y, w, h, img, opacity = 1, rotation = 0) {
        if (!img) return;
        this.ctx2D.save();
        this.ctx2D.translate(x, this.renderHeight - y);
        this.ctx2D.rotate(rotation * Math.PI / 180);
        this.ctx2D.globalAlpha = opacity;
        this.ctx2D.drawImage(img, -w / 2, -h / 2, w, h);
        this.ctx2D.restore();
    }

    drawText(x, y, text, size = 30, style = "white", opacity = 1, rotation = 0) {
        this.ctx2D.save();
        this.ctx2D.translate(x, this.renderHeight - y);
        this.ctx2D.rotate(rotation * Math.PI / 180);
        this.ctx2D.globalAlpha = opacity;
        this.ctx2D.fillStyle = style;
        this.ctx2D.font = size + "px Arial";
        this.ctx2D.textAlign = "center";
        this.ctx2D.textBaseline = "middle";
        this.ctx2D.fillText(text, 0, 0);
        this.ctx2D.restore();
    }

    clear2D() {
        this.ctx2D.save();
        this.ctx2D.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        this.ctx2D.restore();
    }

    fix_canvas(canvas, zIndex) {
        canvas.style.position = 'fixed';
        canvas.style.zIndex = zIndex;
        canvas.style.display = 'block';
        canvas.style.top = '50%';
        canvas.style.left = '50%';
        canvas.style.transform = 'translate(-50%, -50%)';
    }

    async setup_canvas() {
        if (this.display_mode === 'normal_canvas') {

            // canvas
            this.canvas2D = document.createElement('canvas');
            this.canvas3D = document.createElement('canvas');
            document.body.appendChild(this.canvas2D);
            document.body.appendChild(this.canvas3D);

            // ctx
            this.ctx2D = this.canvas2D.getContext('2d');

            // debug outlines
            // this.canvas3D.style.outline = '1px solid blue';
            // this.canvas2D.style.outline = '1px solid red';

            this.fix_canvas(this.canvas3D, 0);
            this.fix_canvas(this.canvas2D, 1);

            this.canvas3D.style.pointerEvents = 'none';
            this.canvas2D.style.pointerEvents = 'auto';

            this.canvas2D.addEventListener('click', async () => {
                this.canvas2D.focus();
                // this.canvas3D.requestFullscreen().catch(() => { });

                if (this.THREE.AudioContext.getContext().state === 'suspended') {
                    await this.THREE.AudioContext.getContext().resume();
                }

                try {
                    await this.canvas2D.requestPointerLock({ unadjustedMovement: true });
                } catch {
                    try {
                        await this.canvas2D.requestPointerLock();
                    } catch (error) { }
                }
            });

            document.addEventListener('pointerlockchange', () => {
                this.look.locked = document.pointerLockElement === this.canvas2D;
                console.log("Mouse locked:", this.look.locked);
            });

            // canvas resize
            this.resize_canvas();
        }
    }


    // scene functions

    add_scene(name, SceneClass) {
        const scene = new SceneClass(this);
        this.scenes.set(name, scene);
        return scene;
    }

    set_scene(name) {
        const newScene = this.scenes.get(name);
        if (!newScene) return;

        if (this.activeScene) {
            this.activeScene.destroy();
        }

        this.activeScene = newScene;

        this.activeScene.init?.();

        newScene.camera.aspect = this.width / this.height;
        newScene.camera.updateProjectionMatrix();
        this.update_post_process();
    }


    // render functions

    render_ui() {
        this.drawText(75, this.renderHeight - 30, `FPS: ${this.fps}`, 30, "white", 1, 0);
    }

    async setup_render() {
        this.renderer = new this.THREE.WebGLRenderer({
            canvas: this.canvas3D,
            antialias: false
        });
        this.renderer.setSize(this.width, this.height, false);
        this.renderer.setPixelRatio(this.dpr);
        this.renderer.toneMapping = this.THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.composer = new this.EffectComposer(this.renderer);
    }

    update_post_process() {
        if (!this.activeScene) return;

        this.composer.passes = [];

        const renderPass = new this.RenderPass(this.activeScene.scene, this.activeScene.camera);
        this.composer.addPass(renderPass);

        this.activeScene.bokehPass = new this.BokehPass(this.activeScene.scene, this.activeScene.camera, {
            focus: 10.0,
            aperture: 0.001,
            maxblur: 0.001
        });
        this.composer.addPass(this.activeScene.bokehPass);
        const bokehPass = this.activeScene.bokehPass

        const ssaoPass = new this.SSAOPass(this.activeScene.scene, this.activeScene.camera, this.width, this.height);
        ssaoPass.kernelRadius = 16;
        ssaoPass.minDistance = 0.005;
        ssaoPass.maxDistance = 0.1;
        this.composer.addPass(ssaoPass);

        const bloomPass = new this.UnrealBloomPass(
            new this.THREE.Vector2(this.width, this.height),
            1.5, 0.4, 0.85
        );
        this.composer.addPass(bloomPass);

        this.outlinePass = new this.OutlinePass(
            new this.THREE.Vector2(this.width * this.dpr, this.height * this.dpr), // Přidáno * this.dpr
            this.activeScene.scene,
            this.activeScene.camera
        );

        this.outlinePass.edgeStrength = 3.0;
        this.outlinePass.edgeGlow = 1.0;
        this.outlinePass.edgeThickness = 1.0;
        this.outlinePass.visibleEdgeColor.set('#ffffff');
        this.outlinePass.hiddenEdgeColor.set('#ffffff');

        this.composer.addPass(this.outlinePass);

        const smaaPass = new this.SMAAPass(this.width * this.dpr, this.height * this.dpr);
        this.composer.addPass(smaaPass);

        const outputPass = new this.OutputPass();
        this.composer.addPass(outputPass);

        if (this.gui) {
            const posteffectFolder = this.gui.addFolder('PostEffects');
            posteffectFolder.close();

            const bloomFolder = posteffectFolder.addFolder('Bloom');
            bloomFolder.add(bloomPass, 'strength', 0, 3);
            bloomFolder.add(bloomPass, 'radius', 0, 1);
            bloomFolder.add(bloomPass, 'threshold', 0, 1);
            bloomFolder.close();

            const outlineFolder = posteffectFolder.addFolder('Outline');
            outlineFolder.add(this.outlinePass, 'edgeStrength', 0, 10);
            outlineFolder.add(this.outlinePass, 'edgeThickness', 0, 4);
            outlineFolder.add(this.outlinePass, 'edgeGlow', 0, 2);
            const params = {
                edgeColor: this.outlinePass.visibleEdgeColor.getHex()
            };
            outlineFolder.addColor(params, 'edgeColor')
                .name('Outline Color')
                .onChange((value) => {
                    this.outlinePass.visibleEdgeColor.set(value);
                });
            const params2 = {
                hedgeColor: this.outlinePass.hiddenEdgeColor.getHex()
            };
            outlineFolder.addColor(params2, 'hedgeColor')
                .name('hOutline Color')
                .onChange((value) => {
                    this.outlinePass.hiddenEdgeColor.set(value);
                });
            outlineFolder.close();
        }
    }


    // asset functions

    createLoadingUI() {
        this.loadingContainer = document.createElement('div');
        Object.assign(this.loadingContainer.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '300px',
            zIndex: '10000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
        });

        this.statusText = document.createElement('div');
        Object.assign(this.statusText.style, {
            color: 'white',
            fontFamily: 'monospace',
            fontSize: '10px',
            textTransform: 'lowercase',
            opacity: '0.8',
            width: '100%',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        });
        this.statusText.innerText = 'Inicialition...';

        const barWrapper = document.createElement('div');
        Object.assign(barWrapper.style, {
            width: '100%',
            height: '4px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            background: 'rgba(0,0,0,0.8)',
            padding: '1px'
        });

        this.loadingBar = document.createElement('div');
        Object.assign(this.loadingBar.style, {
            width: '0%',
            height: '100%',
            background: 'white',
            transition: 'width 0.2s ease-out'
        });

        barWrapper.appendChild(this.loadingBar);
        this.loadingContainer.appendChild(this.statusText);
        this.loadingContainer.appendChild(barWrapper);
        document.body.appendChild(this.loadingContainer);
    }

    updateLoadingUI(percent, path) {
        if (this.loadingBar) {
            this.loadingBar.style.width = `${percent}%`;
        }
        if (this.statusText && path) {
            this.statusText.innerText = `Loading: ${path}`;
        }
    }

    removeLoadingUI() {
        if (this.loadingContainer && this.loadingContainer.parentNode) {
            this.loadingContainer.parentNode.removeChild(this.loadingContainer);
        }
    }

    add_texture(name, path) {
        this.assets.textures.set(name, path);
    }

    add_model(name, path) {
        this.assets.models.set(name, path);
    }

    add_hdri(name, path) {
        this.assets.hdris.set(name, path);
    }

    add_sound(name, path) {
        this.assets.sounds.set(name, path);
    }

    get_number_of_textures() {
        return this.assets.textures.size;
    }

    get_number_of_models() {
        return this.assets.models.size;
    }

    get_number_of_hdris() {
        return this.assets.hdris.size;
    }

    get_number_of_sounds() {
        return this.assets.sounds.size;
    }

    get_texture(name) {
        return this.assets.textures.get(name);
    }

    get_model(name) {
        return this.assets.models.get(name);
    }

    get_hdri(name) {
        return this.assets.hdris.get(name);
    }

    get_sound(name) {
        return this.assets.sounds.get(name);
    }

    async load_assets() {
        this.createLoadingUI();
        const promises = [];
        let loadedCount = 0;

        const totalItems = this.get_number_of_textures() +
            this.get_number_of_models() +
            this.get_number_of_hdris() +
            this.get_number_of_sounds();

        if (totalItems === 0) {
            this.removeLoadingUI();
            return;
        }

        const onProgress = (path) => {
            loadedCount++;
            const percent = (loadedCount / totalItems) * 100;
            this.updateLoadingUI(percent, path);
        };

        for (const [name, path] of this.assets.textures) {
            console.log(`Loading texture: ${path}`);
            promises.push(new Promise((resolve, reject) => {
                this.textureLoader.load(path, (data) => {
                    this.assets.textures.set(name, data);
                    onProgress(path);
                    resolve();
                }, undefined, reject);
            }));
        }

        for (const [name, path] of this.assets.models) {
            console.log(`Loading model: ${path}`);
            promises.push(new Promise((resolve, reject) => {
                this.gltfLoader.load(path, (data) => {
                    this.assets.models.set(name, data);
                    onProgress(path);
                    resolve();
                }, undefined, reject);
            }));
        }

        for (const [name, path] of this.assets.hdris) {
            console.log(`Loading HDRI: ${path}`);
            promises.push(new Promise((resolve, reject) => {
                this.hdrLoader.load(path, (data) => {
                    data.mapping = this.THREE.EquirectangularReflectionMapping;
                    this.assets.hdris.set(name, data);
                    onProgress(path);
                    resolve();
                }, undefined, reject);
            }));
        }

        for (const [name, path] of this.assets.sounds) {
            console.log(`Loading sound: ${path}`);
            promises.push(new Promise((resolve, reject) => {
                this.audioLoader.load(path, (data) => {
                    this.assets.sounds.set(name, data);
                    onProgress(path);
                    resolve();
                }, undefined, reject);
            }));
        }

        await Promise.all(promises);

        this.updateLoadingUI(100, "");
        this.statusText.innerText = 'Complete!';
        await new Promise(r => setTimeout(r, 200));

        this.removeLoadingUI();
    }


    // main functions

    async init({ display_mode }) {
        this.display_mode = display_mode;

        console.log("Initializing engine...");
        await this.setup_canvas();
        await this.load_assets();
        await this.setup_render();
        await this.rapier.init();

    }

    start() {
        this.lastTime = performance.now();
        this.fixedTimeStep = 1 / 60;
        this.accumulator = 0;

        const loop = (time) => {
            const renderDt = (time - this.lastTime) / 1000;
            const dt = Math.min(renderDt, 0.1);
            this.lastTime = time;

            this.accumulator += dt;
            this.fps = Math.round(this.fps * 0.9 + (1 / dt) * 0.1);

            while (this.accumulator >= this.fixedTimeStep) {

                // physics and game logic updates
                if (this.activeScene && this.activeScene.world) {
                    this.activeScene.world.step();
                    this.activeScene.update(this.fixedTimeStep);
                }

                this.accumulator -= this.fixedTimeStep;
            }

            const alpha = this.accumulator / this.fixedTimeStep;

            // render updates
            this.clear2D();
            this.render_ui();
            if (this.renderer && this.activeScene) {
                this.activeScene.render(alpha, renderDt);
                //this.renderer.render(this.activeScene.scene, this.activeScene.camera);
                if (this.composer) {
                    this.composer.render();
                } else {
                    this.renderer.render(this.activeScene.scene, this.activeScene.camera);
                }
            }

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}