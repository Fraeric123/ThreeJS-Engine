/**
 * roblox.js
 * Roblox-inspired API vrstva nad engine.js
 *
 * Exportuje:
 *   - Instance (bázová třída všech objektů světa)
 *   - Part      (kostka / fyzický objekt)
 *   - Model     (kontejner pro více Parts)
 *   - Script    (skript napojený na objekt)
 *   - Camera    (wrapper kolem scénové kamery)
 *   - Light     (světelný zdroj)
 *   - Workspace (singleton – herní svět)
 *   - game      (singleton přes který přistupuješ ke všemu)
 */

import {
    Engine,
    GameScene,
    BoxInstance,
    PlaneInstance,
    BallInstance,
    AnimatedCharacter,
    BasicModelInstance,
    FPSPlayer,
    PortalGunPlayer,
    Player,
    Material,
    RandomHexColor
} from './engine.js';

export { Material, RandomHexColor };

// ─────────────────────────────────────────────────────────────
//  Sdílený stav
// ─────────────────────────────────────────────────────────────

let _engine = null;       // instance Engine
let _gameScene = null;    // instance GameScene
let _idCounter = 0;

function _uid(prefix = 'obj') {
    return `${prefix}_${++_idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─────────────────────────────────────────────────────────────
//  Bázová třída – RbxInstance
//  Každý objekt ve světě z ní dědí.
// ─────────────────────────────────────────────────────────────

export class RbxInstance {
    constructor(className = 'Instance') {
        this.ClassName = className;
        this.Name = className;
        this._parent = null;
        this._children = [];
        this._destroyed = false;

        // Signals (jednoduché event emitter)
        this._listeners = {};
    }

    // ── Hierarchie ──────────────────────────────────────────

    get Parent() { return this._parent; }
    set Parent(p) {
        if (this._parent === p) return;
        if (this._parent) {
            this._parent._children = this._parent._children.filter(c => c !== this);
        }
        this._parent = p;
        if (p) p._children.push(this);
        this._emit('ParentChanged', p);
    }

    GetChildren() {
        return [...this._children];
    }

    GetDescendants() {
        const result = [];
        const walk = (node) => {
            for (const c of node._children) {
                result.push(c);
                walk(c);
            }
        };
        walk(this);
        return result;
    }

    FindFirstChild(name, recursive = false) {
        if (recursive) {
            return this.GetDescendants().find(c => c.Name === name) || null;
        }
        return this._children.find(c => c.Name === name) || null;
    }

    FindFirstChildOfClass(className) {
        return this._children.find(c => c.ClassName === className) || null;
    }

    IsA(className) {
        // Projde prototypový řetězec
        let proto = Object.getPrototypeOf(this);
        while (proto) {
            if (proto.constructor && proto.constructor._className === className) return true;
            proto = Object.getPrototypeOf(proto);
        }
        return this.ClassName === className;
    }

    // ── Events ──────────────────────────────────────────────

    _emit(event, ...args) {
        (this._listeners[event] || []).forEach(fn => fn(...args));
    }

    Connect(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
        return { Disconnect: () => { this._listeners[event] = this._listeners[event].filter(f => f !== fn); } };
    }

    // Roblox-style: instance.Touched.Connect(fn)
    get Touched() { return { Connect: (fn) => this.Connect('Touched', fn) }; }
    get AncestryChanged() { return { Connect: (fn) => this.Connect('ParentChanged', fn) }; }

    // ── Lifecycle ───────────────────────────────────────────

    Clone() {
        // Shallow clone – přepiš ve specializovaných třídách
        const c = new this.constructor();
        c.Name = this.Name;
        return c;
    }

    Destroy() {
        this._destroyed = true;
        this.Parent = null;
        for (const child of [...this._children]) child.Destroy();
    }
}
RbxInstance._className = 'Instance';

// ─────────────────────────────────────────────────────────────
//  Part  – fyzická kostka / sphere / plane
// ─────────────────────────────────────────────────────────────

export class Part extends RbxInstance {
    constructor(options = {}) {
        super('Part');

        // Veřejné vlastnosti (Roblox styl)
        this._size     = options.Size     ?? { x: 1, y: 1, z: 1 };
        this._position = options.Position ?? { x: 0, y: 5, z: 0 };
        this._rotation = options.Rotation ?? { x: 0, y: 0, z: 0 };
        this._color    = options.Color    ?? 0xcccccc;
        this._anchored = options.Anchored ?? false;   // Roblox: Anchored = static
        this._canCollide = options.CanCollide ?? true;
        this._material = options.Material ?? 'default';
        this._shape    = options.Shape    ?? 'Block'; // Block | Ball | Plane

        // Reference na engine instanci (nastavuje se při insertu do Workspace)
        this._engineInstance = null;
        this._id = _uid('part');
    }

    // ── Gettery/Settery synchronizované s fyzikou ──────────

    get Size() { return { ...this._size }; }
    set Size(v) {
        this._size = { x: v.x ?? this._size.x, y: v.y ?? this._size.y, z: v.z ?? this._size.z };
        this._applyToEngine();
    }

    get Position() {
        if (this._engineInstance?.rigidBody) {
            const t = this._engineInstance.rigidBody.translation();
            return { x: t.x, y: t.y, z: t.z };
        }
        return { ...this._position };
    }
    set Position(v) {
        this._position = { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
        if (this._engineInstance?.rigidBody) {
            this._engineInstance.rigidBody.setTranslation(this._position, true);
            if (this._engineInstance.object3D) {
                this._engineInstance.object3D.position.set(this._position.x, this._position.y, this._position.z);
            }
        }
    }

    get Rotation() {
        return { ...this._rotation };
    }
    set Rotation(v) {
        this._rotation = { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
        if (this._engineInstance?.object3D) {
            const DEG2RAD = Math.PI / 180;
            this._engineInstance.object3D.rotation.set(
                this._rotation.x * DEG2RAD,
                this._rotation.y * DEG2RAD,
                this._rotation.z * DEG2RAD
            );
        }
    }

    get Color() { return this._color; }
    set Color(v) {
        this._color = v;
        if (this._engineInstance?.object3D) {
            this._engineInstance.object3D.traverse(child => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.color?.set(v));
                    } else {
                        child.material.color?.set(v);
                    }
                }
            });
        }
    }

    get Anchored() { return this._anchored; }
    set Anchored(v) {
        this._anchored = v;
        // Při změně je nutné znovu insertovat – pro jednoduchost jen varování
        console.warn('Part.Anchored: změna za běhu vyžaduje re-insert. Nastav před Parent=Workspace.');
    }

    get Material() { return this._material; }
    set Material(v) {
        this._material = v;
        this._applyToEngine();
    }

    get Velocity() {
        if (this._engineInstance?.rigidBody) {
            const v = this._engineInstance.rigidBody.linvel();
            return { x: v.x, y: v.y, z: v.z };
        }
        return { x: 0, y: 0, z: 0 };
    }
    set Velocity(v) {
        if (this._engineInstance?.rigidBody) {
            this._engineInstance.rigidBody.setLinvel({ x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 }, true);
        }
    }

    // ── Metody ──────────────────────────────────────────────

    ApplyForce(force) {
        this._engineInstance?.rigidBody?.applyForce({ x: force.x ?? 0, y: force.y ?? 0, z: force.z ?? 0 }, true);
    }

    ApplyImpulse(impulse) {
        this._engineInstance?.rigidBody?.applyImpulse({ x: impulse.x ?? 0, y: impulse.y ?? 0, z: impulse.z ?? 0 }, true);
    }

    GetMass() {
        return this._engineInstance?.rigidBody?.mass() ?? 0;
    }

    // ── Interní ─────────────────────────────────────────────

    _applyToEngine() {
        // Pokud již existuje v enginu, zničíme a vytvoříme znovu
        if (this._engineInstance && _gameScene) {
            _gameScene.remove_instance(this._id);
            this._engineInstance = null;
            this._insertToEngine();
        }
    }

    _insertToEngine() {
        if (!_gameScene || this._engineInstance) return;

        const opts = {
            position: { ...this._position },
            rotation: { ...this._rotation },
            color: this._color,
            material: this._material,
            static: this._anchored,
            size: { ...this._size }
        };

        let InstanceClass = BoxInstance;
        if (this._shape === 'Ball') {
            InstanceClass = BallInstance;
            opts.radius = Math.max(this._size.x, this._size.y, this._size.z) / 2;
        } else if (this._shape === 'Plane') {
            InstanceClass = PlaneInstance;
        }

        this._engineInstance = _gameScene.add_instance(this._id, InstanceClass, opts);
        this._engineInstance._rbxPart = this;

        // Kolize → emit Touched
        const origOnCollide = this._engineInstance.onCollide;
        this._engineInstance.onCollide = (self, other, force) => {
            this._emit('Touched', other._rbxPart ?? other);
            if (origOnCollide) origOnCollide(self, other, force);
        };
    }

    _removeFromEngine() {
        if (this._engineInstance && _gameScene) {
            _gameScene.remove_instance(this._id);
            this._engineInstance = null;
        }
    }

    Destroy() {
        this._removeFromEngine();
        super.Destroy();
    }

    Clone() {
        const c = new Part({
            Size: { ...this._size },
            Position: { ...this._position },
            Rotation: { ...this._rotation },
            Color: this._color,
            Anchored: this._anchored,
            Material: this._material,
            Shape: this._shape
        });
        c.Name = this.Name;
        return c;
    }
}
Part._className = 'Part';

// ─────────────────────────────────────────────────────────────
//  Model – kontejner pro skupinu Parts
// ─────────────────────────────────────────────────────────────

export class Model extends RbxInstance {
    constructor() {
        super('Model');
        this.PrimaryPart = null; // referenční Part pro pozici modelu
    }

    GetParts() {
        return this.GetDescendants().filter(c => c instanceof Part);
    }

    MoveTo(position) {
        const parts = this.GetParts();
        if (this.PrimaryPart) {
            const origin = this.PrimaryPart.Position;
            const delta = { x: position.x - origin.x, y: position.y - origin.y, z: position.z - origin.z };
            parts.forEach(p => {
                const pos = p.Position;
                p.Position = { x: pos.x + delta.x, y: pos.y + delta.y, z: pos.z + delta.z };
            });
        } else {
            parts.forEach(p => p.Position = { ...position });
        }
    }

    // Vrátí bounding box středu
    GetBoundingBox() {
        const parts = this.GetParts();
        if (!parts.length) return null;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const p of parts) {
            const pos = p.Position;
            const s = p.Size;
            minX = Math.min(minX, pos.x - s.x / 2); maxX = Math.max(maxX, pos.x + s.x / 2);
            minY = Math.min(minY, pos.y - s.y / 2); maxY = Math.max(maxY, pos.y + s.y / 2);
            minZ = Math.min(minZ, pos.z - s.z / 2); maxZ = Math.max(maxZ, pos.z + s.z / 2);
        }
        return {
            Center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
            Size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }
        };
    }

    Destroy() {
        this.GetParts().forEach(p => p._removeFromEngine?.());
        super.Destroy();
    }
}
Model._className = 'Model';

// ─────────────────────────────────────────────────────────────
//  Script – skript napojený na objekt
// ─────────────────────────────────────────────────────────────

export class Script extends RbxInstance {
    constructor(fn = null) {
        super('Script');
        this._fn = fn;
        this._running = false;
        this._connections = [];
    }

    // Spustí skript s daným kontextem
    run(context = {}) {
        if (this._running || this._destroyed) return;
        this._running = true;
        if (typeof this._fn === 'function') {
            this._fn(context);
        }
    }

    stop() {
        this._running = false;
        this._connections.forEach(c => c.Disconnect?.());
        this._connections = [];
    }

    Destroy() {
        this.stop();
        super.Destroy();
    }
}
Script._className = 'Script';

// ─────────────────────────────────────────────────────────────
//  Camera – wrapper kolem Three.js kamery
// ─────────────────────────────────────────────────────────────

export class RbxCamera extends RbxInstance {
    constructor() {
        super('Camera');
        this.CameraType = 'Custom'; // Custom | Follow | Scriptable
        this._subject = null;
    }

    get CameraSubject() { return this._subject; }
    set CameraSubject(part) {
        this._subject = part;
        // Přiváže kameru k Part – implementuje se v update loop Workspace
    }

    get FieldOfView() {
        return _gameScene?.camera?.fov ?? 75;
    }
    set FieldOfView(v) {
        if (_gameScene?.camera) {
            _gameScene.camera.fov = v;
            _gameScene.camera.updateProjectionMatrix();
        }
    }

    get Position() {
        if (_gameScene?.camera) {
            const p = _gameScene.camera.position;
            return { x: p.x, y: p.y, z: p.z };
        }
        return { x: 0, y: 5, z: 0 };
    }
    set Position(v) {
        if (_gameScene?.camera) {
            _gameScene.camera.position.set(v.x ?? 0, v.y ?? 0, v.z ?? 0);
        }
    }

    LookAt(target) {
        if (_gameScene?.camera) {
            _gameScene.camera.lookAt(target.x ?? 0, target.y ?? 0, target.z ?? 0);
        }
    }
}
RbxCamera._className = 'Camera';

// ─────────────────────────────────────────────────────────────
//  Light
// ─────────────────────────────────────────────────────────────

export class PointLight extends RbxInstance {
    constructor(options = {}) {
        super('PointLight');
        this.Brightness = options.Brightness ?? 1;
        this.Color = options.Color ?? 0xffffff;
        this.Range = options.Range ?? 10;
        this._light = null;
        this._id = _uid('light');
    }

    _insertToScene() {
        if (!_gameScene || this._light) return;
        const THREE = _engine.THREE;
        this._light = new THREE.PointLight(this.Color, this.Brightness, this.Range);
        const pos = this.Parent instanceof Part ? this.Parent.Position : { x: 0, y: 5, z: 0 };
        this._light.position.set(pos.x, pos.y, pos.z);
        this._light.castShadow = true;
        _gameScene.scene.add(this._light);
    }

    _removeFromScene() {
        if (this._light && _gameScene) {
            _gameScene.scene.remove(this._light);
            this._light = null;
        }
    }

    Destroy() {
        this._removeFromScene();
        super.Destroy();
    }
}
PointLight._className = 'PointLight';

export class DirectionalLight extends RbxInstance {
    constructor(options = {}) {
        super('DirectionalLight');
        this.Brightness = options.Brightness ?? 1;
        this.Color = options.Color ?? 0xffffff;
        this._light = null;
    }

    _insertToScene() {
        if (!_gameScene || this._light) return;
        const THREE = _engine.THREE;
        this._light = new THREE.DirectionalLight(this.Color, this.Brightness);
        this._light.position.set(0, 20, 0);
        this._light.castShadow = true;
        _gameScene.scene.add(this._light);
    }

    _removeFromScene() {
        if (this._light && _gameScene) {
            _gameScene.scene.remove(this._light);
            this._light = null;
        }
    }

    Destroy() {
        this._removeFromScene();
        super.Destroy();
    }
}
DirectionalLight._className = 'DirectionalLight';

// ─────────────────────────────────────────────────────────────
//  Workspace – singleton herního světa (jako game.Workspace)
// ─────────────────────────────────────────────────────────────

export class Workspace extends RbxInstance {
    constructor() {
        super('Workspace');
        this.Name = 'Workspace';
        this.Gravity = 9.81;
        this.Camera = new RbxCamera();
        this._scripts = [];
        this._updateCallbacks = []; // RunService.Heartbeat / Stepped ekvivalent
    }

    // Přidá objekt do světa
    _onChildAdded(child) {
        if (child instanceof Part) {
            child._insertToEngine();
        } else if (child instanceof PointLight || child instanceof DirectionalLight) {
            child._insertToScene();
        }
        // Rekurzivně pro Model
        if (child instanceof Model) {
            child.GetDescendants().forEach(d => this._onChildAdded(d));
        }
    }

    _onChildRemoved(child) {
        if (child instanceof Part) {
            child._removeFromEngine();
        } else if (child instanceof PointLight || child instanceof DirectionalLight) {
            child._removeFromScene();
        }
    }

    // ── Veřejné API ──────────────────────────────────────────

    /**
     * Přidá RbxInstance do Workspace (ekvivalent .Parent = workspace)
     */
    add(instance) {
        instance.Parent = this;
        this._onChildAdded(instance);
        return instance;
    }

    remove(instance) {
        this._onChildRemoved(instance);
        instance.Parent = null;
    }

    FindPartOnRay(origin, direction, maxDistance = 100, ignore = []) {
        if (!_gameScene) return null;
        const rapier = _engine.rapier;
        const ray = new rapier.Ray(
            { x: origin.x, y: origin.y, z: origin.z },
            { x: direction.x, y: direction.y, z: direction.z }
        );
        const hit = _gameScene.world.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, undefined, undefined, (col) => {
            const inst = col.parent()?.userData?.instance;
            if (!inst) return true;
            return !ignore.some(p => p._engineInstance === inst);
        });

        if (!hit) return null;

        const hitPoint = {
            x: origin.x + direction.x * hit.timeOfImpact,
            y: origin.y + direction.y * hit.timeOfImpact,
            z: origin.z + direction.z * hit.timeOfImpact
        };
        const hitNormal = hit.normal;
        const hitInstance = hit.collider?.parent()?.userData?.instance;
        const hitPart = hitInstance?._rbxPart ?? null;

        return { Position: hitPoint, Normal: hitNormal, Instance: hitPart };
    }

    // Gravity setter (mění rapier svět)
    setGravity(g) {
        this.Gravity = g;
        if (_gameScene?.world) {
            _gameScene.world.gravity = { x: 0, y: -g, z: 0 };
        }
    }
}

// ─────────────────────────────────────────────────────────────
//  RunService – Heartbeat / Stepped
// ─────────────────────────────────────────────────────────────

export class RunService {
    constructor() {
        this._heartbeat = [];
        this._stepped   = [];
        this._renderStepped = [];
    }

    Heartbeat(fn) {
        this._heartbeat.push(fn);
        return { Disconnect: () => { this._heartbeat = this._heartbeat.filter(f => f !== fn); } };
    }

    Stepped(fn) {
        this._stepped.push(fn);
        return { Disconnect: () => { this._stepped = this._stepped.filter(f => f !== fn); } };
    }

    RenderStepped(fn) {
        this._renderStepped.push(fn);
        return { Disconnect: () => { this._renderStepped = this._renderStepped.filter(f => f !== fn); } };
    }

    _tick(dt) {
        this._heartbeat.forEach(fn => fn(dt));
        this._stepped.forEach(fn => fn(dt));
    }

    _renderTick(dt) {
        this._renderStepped.forEach(fn => fn(dt));
    }
}

// ─────────────────────────────────────────────────────────────
//  Players (přístup k hráčskému objektu)
// ─────────────────────────────────────────────────────────────

export class Players extends RbxInstance {
    constructor() {
        super('Players');
        this._localPlayer = null;
    }

    get LocalPlayer() { return this._localPlayer; }

    GetPlayers() {
        return this._localPlayer ? [this._localPlayer] : [];
    }
}

// ─────────────────────────────────────────────────────────────
//  game – hlavní singleton (ekvivalent Roblox `game`)
// ─────────────────────────────────────────────────────────────

export class game extends RbxInstance {
    constructor() {
        super('DataModel');
        this.Workspace = new Workspace();
        this.Players   = new Players();
        this.RunService = new RunService();
        this._engine   = null;
        this._scenes   = new Map();
        this._initialized = false;
    }

    /**
     * Inicializuje engine. Vrátí Promise.
     *
     * @param {object} engineLibs  - { rapier, THREE, Stats, GLTFLoader, ... }
     * @param {object} engineOpts  - { display_mode }
     */
    async init(engineLibs, engineOpts = { display_mode: 'normal_canvas' }) {
        _engine = new Engine(engineLibs);
        this._engine = _engine;

        return _engine.init(engineOpts).then(() => {
            // Vytvoříme výchozí scénu
            _gameScene = _engine.add_scene('workspace', GameScene);
            _engine.set_scene('workspace');

            // Propojíme RunService s engine loop
            // (Engine nám neumožňuje vstřikovat callback přímo,
            //  tak zapatchujeme GameScene.update)
            const origUpdate = _gameScene.update.bind(_gameScene);
            _gameScene.update = (dt) => {
                this.RunService._tick(dt);
                origUpdate(dt);
            };

            const origRender = _gameScene.render.bind(_gameScene);
            _gameScene.render = (alpha, renderDt) => {
                this.RunService._renderTick(renderDt);
                this._followCameraSubject();
                origRender(alpha, renderDt);
            };

            this._initialized = true;
            return this;
        });
    }

    _followCameraSubject() {
        const cam = this.Workspace.Camera;
        const subj = cam._subject;
        if (!subj || !_gameScene) return;
        const pos = subj.Position;
        if (_gameScene.camera) {
            _gameScene.camera.position.set(pos.x, pos.y + 2, pos.z + 5);
            _gameScene.camera.lookAt(pos.x, pos.y, pos.z);
        }
    }

    // ── Asset management ────────────────────────────────────

    addTexture(name, path) { _engine.add_texture(name, path); return this; }
    addModel(name, path)   { _engine.add_model(name, path);   return this; }
    addSound(name, path)   { _engine.add_sound(name, path);   return this; }
    addHDRI(name, path)    { _engine.add_hdri(name, path);    return this; }
    addMaterial(mat)       { _engine.add_material(mat);       return this; }

    setHDRI(name, exposure = 1) {
        _gameScene?.set_hdri(name, exposure);
        return this;
    }

    // ── Player management ────────────────────────────────────

    /**
     * Přidá hráče do světa.
     * @param {'FPS' | 'PortalGun'} type
     * @param {object} options
     */
    spawnPlayer(type = 'FPS', options = {}) {
        if (!_gameScene) throw new Error('game.init() musí být zavoláno dřív');
        const classes = { FPS: FPSPlayer ?? Player, PortalGun: PortalGunPlayer };
        const Cls = classes[type] ?? Player;
        const inst = _gameScene.add_instance(_uid('player'), Cls, options);
        this.Players._localPlayer = {
            _engineInstance: inst,
            get Position() {
                const t = inst.rigidBody?.translation();
                return t ? { x: t.x, y: t.y, z: t.z } : { x: 0, y: 0, z: 0 };
            }
        };
        return inst;
    }

    // ── Zkratkové gettery ─────────────────────────────────

    get workspace() { return this.Workspace; }

    // ── Spuštění herní smyčky ─────────────────────────────

    start() {
        if (!_engine) throw new Error('game.init() musí být zavoláno dřív');
        _engine.start();
        return this;
    }
}
