


export class Instance {
    constructor(engine, gameScene) {
        this.engine = engine;
        this.gameScene = gameScene;
        this.scene = gameScene.scene;
        this.world = gameScene.world;

        this.object3D = null;
        this.rigidBody = null;
    }

    sync_with_physics() {
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
        
        this.rootDefaultPositions = new Map();
        this.rootDefaultQuaternions = new Map();
        this.currentRootAxes = { x: false, y: false, z: false, rot: false };
    }

    init() {
        if (this.object3D) return;

        const asset = this.engine.get_model(this.modelName);
        if (!asset) return;

        this.object3D = this.engine.clone(asset.scene);
        this.scene.add(this.object3D);

        this.object3D.scale.set(this.size.x*this.scale, this.size.y*this.scale, this.size.z*this.scale);

        this.object3D.traverse(obj => {
            if (obj.isBone) {
                const name = obj.name.toLowerCase();
                if (name.includes('root') || name.includes('hips') || name.includes('pelvis')) {
                    this.rootDefaultPositions.set(obj.uuid, obj.position.clone());
                    this.rootDefaultQuaternions.set(obj.uuid, obj.quaternion.clone());
                }
            }
        });

        this.mixer = new this.engine.THREE.AnimationMixer(this.object3D);
        asset.animations.forEach(clip => {
            const action = this.mixer.clipAction(clip);
            this.actions.set(clip.name, action);
        });

        console.log("Available animations:", Array.from(this.actions.keys()));

        this.playAnimation(this.options.defaultAnimation ?? asset.animations[29]?.name);

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

            this.object3D.traverse(obj => {
                if (obj.isBone && this.rootDefaultPositions.has(obj.uuid)) {
                    const defaultPos = this.rootDefaultPositions.get(obj.uuid);
                    const axes = this.currentRootAxes;

                    if (!axes.x) obj.position.x = defaultPos.x;
                    if (!axes.y) obj.position.y = defaultPos.y;
                    if (!axes.z) obj.position.z = defaultPos.z;

                    if (!axes.rot) {
                        const defaultQuat = this.rootDefaultQuaternions.get(obj.uuid);
                        obj.quaternion.copy(defaultQuat);
                    }
                }
            });
        }

        this.sync_with_physics();
        if (this.object3D) {
            this.object3D.position.y -= (this.height / 2 + this.radius);
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


        const light = new this.engine.THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 10, 5);
        this.scene.add(light);

        this.scene.add(new this.engine.THREE.AmbientLight(0xffffff, 0.4));

        this.camera = new engine.THREE.PerspectiveCamera(
            75,
            engine.width / engine.height,
            0.1,
            1000
        );

        this.listener = new engine.THREE.AudioListener();
        this.camera.add(this.listener);

        this.camera.position.set(0, 2, 8);
        this.camera.lookAt(0, 0, 0);

        this.world = new engine.rapier.World({ x: 0, y: -9.81, z: 0 });

        this.running = true;
        this.instances = new Map();
    }

    render() { }


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
    constructor({ rapier, THREE, GLTFLoader, RGBELoader, clone }) {

        //libs
        this.rapier = rapier;
        this.THREE = THREE;
        this.RGBELoader = RGBELoader;
        this.clone = clone; // clone from SkeletonUtils

        // loaders
        this.textureLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();
        this.audioLoader = new THREE.AudioLoader();
        this.hdrLoader = new RGBELoader();

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
    }


    // render functions

    render_ui() {
        this.drawText(75, this.renderHeight - 30, `FPS: ${this.fps}`, 30, "white", 1, 0);
    }

    async setup_render() {
        this.renderer = new this.THREE.WebGLRenderer({
            canvas: this.canvas3D,
            antialias: true
        });
        this.renderer.setSize(this.width, this.height, false);
        this.renderer.setPixelRatio(this.dpr);
        this.renderer.toneMapping = this.THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
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
            const dt = Math.min((time - this.lastTime) / 1000, 0.1);
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

            // render updates
            this.clear2D();
            this.render_ui();
            if (this.renderer && this.activeScene) {
                this.renderer.render(
                    this.activeScene.scene,
                    this.activeScene.camera
                );

                this.activeScene.render();
            }

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}