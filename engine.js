



export const DEG2RAD = Math.PI / 180;


export const RandomHexColor = () => {
    const randomColor = Math.floor(Math.random() * 16777215).toString(16);
    return "#" + randomColor.padStart(6, '0');
};





export class Material {
    constructor(name = 'default', options = {}) {
        this.name = name;
        this.textures = {
            diffuse: options.diffuse || null,
            normal: options.normal || null,
            roughness: options.roughness || null,
            metalness: options.metalness || null,
            ao: options.ao || null
        };
        this.physics = {
            friction: options.friction ?? 0.5,
            restitution: options.restitution ?? 0.2,
            density: options.density ?? 1.0
        };
        this.sounds = {
            impact: options.impactSound || null,
            break: options.breakSound || null,
            scrape: options.scrapeSound || null,
            step: options.stepSound || null
        };
        this.health = options.health ?? 100;
        this.static = options.static ?? false;
    }
}





export class Instance {
    constructor(engine, gameScene, options = {}) {
        this.engine = engine;
        this.gameScene = gameScene;
        this.scene = gameScene.scene;
        this.world = gameScene.world;

        this.onInit = options.onInit || null;
        this.onUpdate = options.onUpdate || null;
        this.onDestroy = options.onDestroy || null;

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

    init() {
        if (this.onInit) this.onInit(this);
    }

    update(dt) {
        if (this.onUpdate) this.onUpdate(this, dt);
    }

    duplicate(gameScene, newOptions = {}) {
        const mergedOptions = { ...this.options, ...newOptions };

        const id = "copy_" + Math.random().toString(16).slice(2);

        return gameScene.add_instance(id, this.constructor, mergedOptions);
    }

    destroy() {
        if (this.onDestroy) this.onDestroy(this);

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




export class BallInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene, options);
        this.options = options;
        this.materialDef = this.engine.get_material(options.material || 'default');

        this.radius = options.radius ?? (options.scale ?? 1) / 2;
        this.position = options.position ?? { x: 0, y: 5, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };
        this.color = options.color ?? 0xffffff;
        this.detail = options.detail ?? 32;
        this.static = options.static ?? this.materialDef.static;
    }

    init() {
        if (this.object3D) return;

        const geo = new this.engine.THREE.SphereGeometry(this.radius, this.detail, this.detail);
        const mat = new this.engine.THREE.MeshStandardMaterial({ color: this.color });
        if (this.materialDef.textures.diffuse) {
            mat.map = this.engine.get_texture(this.materialDef.textures.diffuse);
        }

        this.object3D = new this.engine.THREE.Mesh(geo, mat);
        this.object3D.castShadow = this.object3D.receiveShadow = true;
        this.scene.add(this.object3D);

        const rbDesc = this.static ?
            this.engine.rapier.RigidBodyDesc.fixed() :
            this.engine.rapier.RigidBodyDesc.dynamic();

        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z);
        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };

        const colDesc = this.engine.rapier.ColliderDesc.ball(this.radius)
            .setFriction(this.materialDef.physics.friction)
            .setRestitution(this.materialDef.physics.restitution)
            .setDensity(this.materialDef.physics.density);

        this.world.createCollider(colDesc, this.rigidBody);
    }

    update(dt) {
        if (!this.static) this.sync_with_physics();
        super.update(dt);
    }
}





export class BlackHoleInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene, options);

        this.options = options;
        this.radius = options.radius ?? 1.0;
        this.mass = options.mass ?? 1.0;
        this.position = options.position ?? { x: 0, y: 10, z: -20 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };

        this.materialDef = this.engine.get_material(options.material || 'default');
        this.static = options.static ?? false;
    }

    init() {
        if (this.object3D) return;

        // 1. Vizuální část - vytvoříme neviditelnou sféru pro reprezentaci v Three.js
        // (Shader se vykresluje přes celou obrazovku, ale potřebujeme objekt v paměti)
        const geo = new this.engine.THREE.SphereGeometry(this.radius, 8, 8);
        const mat = new this.engine.THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.0 // Neviditelná, efekt dělá shader
        });

        this.object3D = new this.engine.THREE.Mesh(geo, mat);
        this.object3D.position.set(this.position.x, this.position.y, this.position.z);
        this.scene.add(this.object3D);

        // 2. Fyzikální část (Rapier) - stejné jako BallInstance
        const rbDesc = this.static ?
            this.engine.rapier.RigidBodyDesc.fixed() :
            this.engine.rapier.RigidBodyDesc.dynamic();

        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z);

        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };

        const colliderDesc = this.engine.rapier.ColliderDesc.ball(this.radius)
            .setFriction(this.materialDef.physics.friction)
            .setRestitution(this.materialDef.physics.restitution);

        this.world.createCollider(colliderDesc, this.rigidBody);

        // 3. Aktivace shaderu
        if (this.engine.blackHolePass) {
            this.engine.blackHolePass.enabled = true;
            this.updateShaderUniforms();
        }
    }

    // V engine.js uprav metodu v BlackHoleInstance:

    updateShaderUniforms() {
        const pass = this.engine.blackHolePass;
        if (pass && this.rigidBody) {
            const pos = this.rigidBody.translation();
            const rot = this.rigidBody.rotation(); // Rapier vrací kvaternion {x, y, z, w}

            pass.uniforms["bhPos"].value.set(pos.x, pos.y, pos.z);
            pass.uniforms["bhMass"].value = this.mass;

            // Vytvoříme rotační matici z kvaternionu pro shader
            const quaternion = new this.engine.THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
            const rotationMatrix = new this.engine.THREE.Matrix4().makeRotationFromQuaternion(quaternion);

            // Předáme matici do shaderu (v shaderu ji nazveme bhRotation)
            if (pass.uniforms["bhRotation"]) {
                pass.uniforms["bhRotation"].value.copy(rotationMatrix);
            }
        }
    }
    update(dt) {
        if (!this.static) {
            this.sync_with_physics(); // Nejdřív srovnat pozici a rotaci 3D objektu
        }

        this.updateShaderUniforms(); // Pak poslat čerstvá data do shaderu
        super.update(dt);
    }

    destroy() {
        // Po smazání instance efekt vypneme
        if (this.engine.blackHolePass) {
            this.engine.blackHolePass.enabled = false;
        }
        super.destroy();
    }
}





export class BasicModelInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);
        this.options = options;
        this.modelName = options.model;
        this.position = options.position ?? { x: 0, y: 0, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };
        this.scale = options.scale ?? 1;
        this.static = options.static ?? false;
        this.materialDef = this.engine.get_material(options.material || 'default');
        this.colliderType = options.colliderType ?? "box";
    }

    init() {
        if (this.object3D) return;

        const asset = this.engine.get_model(this.modelName);
        if (!asset) return;

        this.object3D = this.engine.clone(asset.scene);

        this.object3D.scale.setScalar(this.scale);
        this.object3D.position.set(0, 0, 0);
        this.object3D.rotation.set(0, 0, 0);
        this.object3D.updateMatrixWorld(true);

        this.object3D.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        let colDesc;
        let colOffset = { x: 0, y: 0, z: 0 };

        if (this.colliderType === "shape_from_model") {
            const vertices = [];
            const indices = [];

            this.object3D.traverse(child => {
                if (child.isMesh) {
                    const geometry = child.geometry;
                    const posAttr = geometry.attributes.position;
                    const indexAttr = geometry.index;
                    const startIdx = vertices.length / 3;

                    for (let i = 0; i < posAttr.count; i++) {
                        const v = new this.engine.THREE.Vector3().fromBufferAttribute(posAttr, i);
                        v.applyMatrix4(child.matrixWorld);
                        vertices.push(v.x, v.y, v.z);
                    }

                    if (indexAttr) {
                        for (let i = 0; i < indexAttr.count; i++) {
                            indices.push(indexAttr.getX(i) + startIdx);
                        }
                    } else {
                        for (let i = 0; i < posAttr.count; i++) {
                            indices.push(i + startIdx);
                        }
                    }
                }
            });

            if (vertices.length > 0) {
                colDesc = this.engine.rapier.ColliderDesc.trimesh(
                    new Float32Array(vertices),
                    new Uint32Array(indices)
                );
            }
        } else {
            const box = new this.engine.THREE.Box3().setFromObject(this.object3D);
            const size = new this.engine.THREE.Vector3();
            const center = new this.engine.THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            colOffset = { x: center.x, y: center.y, z: center.z };

            if (this.colliderType === "sphere") {
                colDesc = this.engine.rapier.ColliderDesc.ball(Math.max(size.x, size.y, size.z) / 2);
            } else if (this.colliderType === "box") {
                colDesc = this.engine.rapier.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
            }
        }

        this.object3D.position.set(this.position.x, this.position.y, this.position.z);
        this.object3D.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
        this.object3D.updateMatrixWorld(true);
        this.scene.add(this.object3D);

        const rbDesc = this.static ?
            this.engine.rapier.RigidBodyDesc.fixed() :
            this.engine.rapier.RigidBodyDesc.dynamic();

        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z)
            .setRotation(this.object3D.quaternion);

        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };

        if (colDesc) {
            colDesc.setFriction(this.materialDef.physics.friction)
                .setRestitution(this.materialDef.physics.restitution)
                .setDensity(this.materialDef.physics.density);

            colDesc.setTranslation(colOffset.x, colOffset.y, colOffset.z);
            this.world.createCollider(colDesc, this.rigidBody);
        }
    }

    update(dt) {
        if (!this.static) {
            this.sync_with_physics();
        }
    }
}






export class Player extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);

        this.position = options.position ?? { x: 0, y: 0, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };

        this.walkSpeed = 5;
        this.sprintSpeed = 20;
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
            .setTranslation(this.position.x, this.position.y, this.position.z)
            .setRotation(new this.engine.THREE.Quaternion().setFromEuler(
                new this.engine.THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z)
            ))
            .lockRotations()
            .setLinearDamping(0.5);

        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };
        this.createCollider(this.standHeight);
    }

    createCollider(height) {
        if (this.collider) this.world.removeCollider(this.collider, true);
        const colliderDesc = this.engine.rapier.ColliderDesc.capsule(height / 2, this.radius)
            .setFriction(0.0)
            .setActiveEvents(this.engine.rapier.ActiveEvents.COLLISION_EVENTS);
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);
    }

    playFootstepSound() {
        const pos = this.rigidBody.translation();
        const ray = new this.engine.rapier.Ray({ x: pos.x, y: pos.y, z: pos.z }, { x: 0, y: -1, z: 0 });
        const hit = this.world.castRay(ray, 1.5, true);

        if (hit) {
            const instance = hit.collider.parent()?.userData?.instance;
            if (instance && instance.materialDef?.sounds.step) {
                this.engine.play_sound(instance.materialDef.sounds.step, {
                    volume: this.isCrouching ? 0.1 : 0.25
                });
            }
        }
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

        if (this.isMoving && Math.abs(velocity.y) < 0.1) {
            const stepTrigger = Math.sin(this.bobTime);
            if (stepTrigger > 0.95 && !this.stepReady) {
                this.playFootstepSound();
                this.stepReady = true;
            } else if (stepTrigger < 0) {
                this.stepReady = false;
            }
        }

        if (input.up && Math.abs(velocity.y) < 0.05 && !this.isCrouching) {
            this.rigidBody.applyImpulse({ x: 0, y: this.jumpForce, z: 0 }, true);
        }
    }
}






export class Projectile extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);
        this.options = options;
        this.speed = options.speed || 40;
        this.radius = options.radius || 0.1;
        this.lifeTime = options.lifeTime || 3;
        this.explosionRadius = options.explosionRadius || 5;
        this.explosionForce = options.explosionForce || 15;
        this.materialDef = this.engine.get_material(options.material || 'default');

        this.spawnTime = performance.now();
        this.color = options.color ?? 0xffffff;
    }

    init() {
        const geo = new this.engine.THREE.SphereGeometry(this.radius, 8, 8);
        const mat = new this.engine.THREE.MeshStandardMaterial({
            color: this.color,
            emissive: this.color,
            emissiveIntensity: 2
        });
        this.object3D = new this.engine.THREE.Mesh(geo, mat);
        this.scene.add(this.object3D);

        const rbDesc = this.engine.rapier.RigidBodyDesc.dynamic()
            .setTranslation(this.options.position.x, this.options.position.y, this.options.position.z)
            .setCcdEnabled(true);

        this.rigidBody = this.world.createRigidBody(rbDesc);
        const colDesc = this.engine.rapier.ColliderDesc.ball(this.radius)
            .setRestitution(0.1)
            .setActiveEvents(this.engine.rapier.ActiveEvents.COLLISION_EVENTS);

        this.world.createCollider(colDesc, this.rigidBody);

        const dir = this.options.direction;
        this.rigidBody.applyImpulse({
            x: dir.x * this.speed,
            y: dir.y * this.speed,
            z: dir.z * this.speed
        }, true);
    }

    onCollide(self, other, force) {
        if (other && other.materialDef?.sounds.impact) {
            const pos = this.rigidBody.translation();
            this.engine.play_sound_3d(other.materialDef.sounds.impact, pos, {
                volume: 0.5,
                refDistance: 5
            });
        }
        this.explode();
    }

    explode() {
        const pos = this.rigidBody.translation();

        this.world.forEachRigidBody((body) => {
            const bPos = body.translation();
            const dist = Math.sqrt(
                Math.pow(pos.x - bPos.x, 2) +
                Math.pow(pos.y - bPos.y, 2) +
                Math.pow(pos.z - bPos.z, 2)
            );

            if (dist < this.explosionRadius && dist > 0.1) {
                const forceFactor = (1 - dist / this.explosionRadius) * this.explosionForce;
                const dir = {
                    x: (bPos.x - pos.x) / dist,
                    y: (bPos.y - pos.y) / dist + 0.5,
                    z: (bPos.z - pos.z) / dist
                };

                body.applyImpulse({
                    x: dir.x * forceFactor,
                    y: dir.y * forceFactor,
                    z: dir.z * forceFactor
                }, true);
            }
        });

        this.gameScene.remove_instance(this.object3D.userData.instanceId);
    }

    update(dt) {
        if ((performance.now() - this.spawnTime) / 1000 > this.lifeTime) {
            this.gameScene.remove_instance(this.object3D.userData.instanceId);
        }
    }
}





export class FPSPlayer extends Player {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene, options);

        this.weapon = {
            fireRate: 0.01,
            lastFire: 0,
            bulletSpeed: 120,
            bulletLife: 20,
            explosionRadius: 60,
            explosionForce: 200,
            autoFire: true
        };

        this.isFiring = false;
    }

    init() {
        super.init();

        if (this.engine.gui) {
            const folder = this.engine.gui.addFolder("Weapon Settings");
            folder.add(this.weapon, 'fireRate', 0.05, 1.0).name("Fire Rate");
            folder.add(this.weapon, 'bulletSpeed', 10, 200).name("Bullet Speed");
            folder.add(this.weapon, 'explosionRadius', 1, 20).name("Blast Radius");
            folder.add(this.weapon, 'explosionForce', 0, 100).name("Blast Force");
            folder.add(this.weapon, 'autoFire').name("Full Auto");
            folder.close();
        }

        if (this.engine.isMobile) {
            this.createMobileShootButton();
        }

        this._onMouseDown = (e) => { if (e.button === 0) this.isFiring = true; };
        this._onMouseUp = (e) => { if (e.button === 0) this.isFiring = false; };
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
    }

    createMobileShootButton() {
        const btn = document.createElement('div');
        btn.innerHTML = 'shoot';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '140px',
            right: '40px',
            width: '60px',
            height: '30px',
            background: 'rgba(255, 0, 0, 0.3)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '12px',
            zIndex: '2000',
            pointerEvents: 'auto',
            border: '2px solid rgba(255,255,255,0.5)',
            userSelect: 'none'
        });

        btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.isFiring = true; });
        btn.addEventListener('touchend', () => { this.isFiring = false; });
        document.body.appendChild(btn);
    }

    shoot() {
        const now = performance.now() / 1000;
        if (now - this.weapon.lastFire < this.weapon.fireRate) return;

        this.weapon.lastFire = now;

        const yaw = this.engine.look.yaw;
        const pitch = this.engine.look.pitch;

        const dir = new this.engine.THREE.Vector3(
            -Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            -Math.cos(yaw) * Math.cos(pitch)
        );

        const camPos = this.engine.activeScene.camera.position;
        const spawnPos = {
            x: camPos.x + dir.x * 1,
            y: camPos.y + dir.y * 1,
            z: camPos.z + dir.z * 1
        };

        const id = "bullet_" + Math.random().toString(16).slice(2);
        this.gameScene.add_instance(id, Projectile, {
            position: spawnPos,
            direction: dir,
            speed: this.weapon.bulletSpeed,
            lifeTime: this.weapon.bulletLife,
            explosionRadius: this.weapon.explosionRadius,
            explosionForce: this.weapon.explosionForce
        });
    }

    update(dt) {
        super.update(dt);

        if (this.isFiring) {
            this.shoot();
            if (!this.weapon.autoFire) this.isFiring = false;
        }
    }

    destroy() {
        super.destroy();
        if (this._onMouseDown) {
            window.removeEventListener('mousedown', this._onMouseDown);
            this._onMouseDown = null;
        }
        if (this._onMouseUp) {
            window.removeEventListener('mouseup', this._onMouseUp);
            this._onMouseUp = null;
        }
    }
}








export class AnimatedCharacter extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);

        this.options = options;
        this.modelName = options.model;
        this.position = options.position ?? { x: 0, y: 0, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };
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
            if (obj.isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
            }
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

        if (this.engine.gui) {
            if (!this.scene.charFolder) {
                this.scene.charFolder = this.engine.gui.addFolder("Characters");
                this.scene.charFolder.close();
            }
            const folder = this.scene.charFolder.addFolder(this.modelName);
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
            .setRotation(new this.engine.THREE.Quaternion().setFromEuler(
                new this.engine.THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z)
            ))
            .lockRotations();

        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };
        const colliderDesc = this.engine.rapier.ColliderDesc.capsule(this.height / 2, this.radius)
            .setActiveEvents(this.engine.rapier.ActiveEvents.COLLISION_EVENTS);
        this.world.createCollider(colliderDesc, this.rigidBody);
    }

    playAnimation(name, animOptions = {}) {
        const duration = animOptions.duration ?? 0.2;

        this.currentRootAxes = {
            x: animOptions.rootAxes?.x ?? this.currentRootAxes.x,
            y: animOptions.rootAxes?.y ?? this.currentRootAxes.y,
            z: animOptions.rootAxes?.z ?? this.currentRootAxes.z,
            rot: animOptions.rootAxes?.rot ?? this.currentRootAxes.rot
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

            this.object3D.updateMatrixWorld(true);
            this.object3D.traverse(obj => {
                if (obj.isSkinnedMesh) {
                    obj.skeleton.update();
                }
            });
        }

    }
}









export class Indoraptor extends AnimatedCharacter {
    constructor(engine, gameScene, options = {}) {
        options.model = options.model || "indoraptor";
        super(engine, gameScene, options);

        this.runSpeed = options.runSpeed ?? 7.0;
        this.walkSpeed = options.walkSpeed ?? 2.0;
        this.stalkSpeed = options.stalkSpeed ?? 1.2;
        this.turnSpeed = options.turnSpeed ?? 3.5;

        this.attackDistance = 3.0;
        this.stalkDistance = 15.0;
        this.detectionDistance = 35.0;

        this.aggressiveness = Math.random();
        this.curiosity = Math.random();

        this.state = "idle";
        this.stateTimer = 0;
        this.actionCooldown = 0;
        this.stuckTimer = 0;
        this.targetDirection = new this.engine.THREE.Vector3(0, 0, 1);
        this.investigateTarget = null;

        this.anims = {
            idles: [
                "indoraptor_pm_Indoraptor_skeleton|a_idle",
                "indoraptor_pm_Indoraptor_skeleton|a_idle.001",
                "indoraptor_pm_Indoraptor_skeleton|a_idle_crouch2",
                "indoraptor_pm_Indoraptor_skeleton|camera_idle"
            ],
            walks: [
                "indoraptor_pm_Indoraptor_skeleton|a_walkN",
                "indoraptor_pm_Indoraptor_skeleton|a_crouchN"
            ],
            runs: [
                "indoraptor_pm_Indoraptor_skeleton|a_runN",
                "indoraptor_pm_Indoraptor_skeleton|b_runN"
            ],
            attacks: [
                "indoraptor_pm_Indoraptor_skeleton|a_idle",
            ],
            jump: "indoraptor_pm_Indoraptor_skeleton|a_jump",
            flinch: "indoraptor_pm_Indoraptor_skeleton|a_flinch"
        };
    }

    init() {
        super.init();
        this.pickRandomAction();
        this.currentQuat = new this.engine.THREE.Quaternion();
    }

    playAnim(animName, duration = 0.4) {
        this.playAnimation(animName, { duration: duration });
    }

    playRandomAnim(animArray, duration = 0.4) {
        const randomAnim = animArray[Math.floor(Math.random() * animArray.length)];
        this.playAnim(randomAnim, duration);
    }

    pickRandomAction() {
        if (Math.random() > 0.4) {
            this.state = "idle";
            this.stateTimer = 2 + Math.random() * 4;
            this.playRandomAnim(this.anims.idles, 0.5);
            this.targetDirection.set(0, 0, 0);
        } else {
            this.state = "wander";
            this.stateTimer = 2 + Math.random() * 5;
            this.playAnim(this.anims.walks[0], 0.5);
            const angle = Math.random() * Math.PI * 2;
            this.targetDirection.set(Math.cos(angle), 0, Math.sin(angle));
        }
    }

    isValidObstacle(hit) {
        if (!hit || !hit.collider) return false;
        const colliderOwner = hit.collider.parent();
        if (!colliderOwner) return false;

        const hitObj = colliderOwner.userData?.instance;
        return hitObj && hitObj !== this.gameScene.player && hitObj !== this;
    }

    calculateAvoidance(baseDir) {
        if (!this.rigidBody) return { dir: baseDir, shouldJump: false };

        const pos = this.rigidBody.translation();

        const lowerOrigin = { x: pos.x, y: pos.y + 0.3, z: pos.z };
        const upperOrigin = { x: pos.x, y: pos.y + 1.5, z: pos.z };

        let vDir = new this.engine.THREE.Vector3(baseDir.x, 0, baseDir.z);
        if (vDir.lengthSq() < 0.0001) vDir.set(0, 0, 1);
        vDir.normalize();

        let avoidDir = vDir.clone();
        let hitSomething = false;
        let shouldJump = false;

        const forwardRayLow = new this.engine.rapier.Ray(lowerOrigin, { x: vDir.x, y: 0, z: vDir.z });
        const forwardRayHigh = new this.engine.rapier.Ray(upperOrigin, { x: vDir.x, y: 0, z: vDir.z });

        const hitLow = this.world.castRay(forwardRayLow, 3.0, true);
        const hitHigh = this.world.castRay(forwardRayHigh, 3.0, true);

        if (this.isValidObstacle(hitLow)) {
            hitSomething = true;
            if (!this.isValidObstacle(hitHigh) || hitHigh.toi > hitLow.toi + 1.0) {
                if (hitLow.toi < 2.5) {
                    shouldJump = true;
                }
            }
        }

        const angles = [0, -0.6, 0.6, -1.2, 1.2];
        const rayLength = 4.0;

        for (let angle of angles) {
            const rayDir = vDir.clone().applyAxisAngle(new this.engine.THREE.Vector3(0, 1, 0), angle);
            if (isNaN(rayDir.x)) continue;

            const ray = new this.engine.rapier.Ray(lowerOrigin, { x: rayDir.x, y: 0, z: rayDir.z });
            const hit = this.world.castRay(ray, rayLength, true);

            if (this.isValidObstacle(hit)) {
                hitSomething = true;
                const force = Math.pow((rayLength - hit.toi) / rayLength, 2);
                avoidDir.sub(rayDir.multiplyScalar(force * 3.5));
            }
        }

        if (hitSomething && avoidDir.lengthSq() < 0.1) {
            avoidDir = vDir.clone().applyAxisAngle(new this.engine.THREE.Vector3(0, 1, 0), Math.PI / 2);
        }

        return {
            dir: hitSomething ? avoidDir.normalize() : vDir,
            shouldJump: shouldJump
        };
    }

    update(dt) {
        super.update(dt);

        if (this.engine.engine_mode !== "game") return;

        const player = this.gameScene.player;
        if (!player || player === "no-player" || !player.rigidBody) return;

        const myPos = this.rigidBody.translation();
        const playerPos = player.rigidBody.translation();
        const currentVel = this.rigidBody.linvel();

        const dx = playerPos.x - myPos.x;
        const dz = playerPos.z - myPos.z;
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        this.actionCooldown -= dt;
        this.stateTimer -= dt;

        let dirToPlayer = new this.engine.THREE.Vector3(0, 0, 0);
        if (distToPlayer > 0.01) {
            dirToPlayer.set(dx / distToPlayer, 0, dz / distToPlayer);
        } else {
            dirToPlayer.set(0, 0, 1);
        }

        let desiredSpeed = 0;

        const horizSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);

        if (this.state !== "idle" && this.state !== "attack" && this.state !== "jump" && horizSpeed < 0.5) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
        }

        if (this.stuckTimer > 0.5 && this.actionCooldown <= 0 && this.state !== "jump") {
            this.state = "jump";
            this.actionCooldown = 1.0;
            this.stuckTimer = 0;
            this.playAnim(this.anims.jump, 0.2);

            this.rigidBody.applyImpulse({ x: dirToPlayer.x * 2, y: 12, z: dirToPlayer.z * 2 }, true);
        }

        if (this.state === "jump") {
            if (currentVel.y <= 0 && this.actionCooldown < 0) {
                this.state = "chase";
                this.playAnim(this.anims.runs[0], 0.3);
            }
        }
        else if (this.state === "investigate") {
            desiredSpeed = 0;
            if (this.stateTimer <= 0) this.pickRandomAction();
        }
        else if (this.state === "attack") {
            desiredSpeed = 0;
            if (this.stateTimer <= 0) this.state = "chase";
        }
        else {
            if (distToPlayer > this.detectionDistance) {
                if (this.stateTimer <= 0) this.pickRandomAction();
                if (this.state === "wander") {
                    desiredSpeed = this.walkSpeed;
                    dirToPlayer.copy(this.targetDirection);
                }
            }
            else if (distToPlayer > this.stalkDistance) {
                this.state = "chase";
                desiredSpeed = this.runSpeed * (this.aggressiveness > 0.5 ? 1.2 : 1.0);
                if (!this.currentAction || !this.currentAction.getClip().name.includes('run')) {
                    this.playRandomAnim(this.anims.runs, 0.4);
                }

                if (distToPlayer < 12 && distToPlayer > 8 && Math.random() < 0.01 && this.actionCooldown <= 0) {
                    this.state = "jump";
                    this.actionCooldown = 1.2;
                    this.playAnim(this.anims.jump, 0.2);
                    this.rigidBody.applyImpulse({ x: dirToPlayer.x * 12, y: 10, z: dirToPlayer.z * 12 }, true);
                }
            }
            else if (distToPlayer > this.attackDistance) {
                this.state = "stalk";
                desiredSpeed = this.aggressiveness < 0.6 ? this.stalkSpeed : this.runSpeed;
                const stalkAnim = this.aggressiveness < 0.6 ? this.anims.walks[1] : this.anims.runs[0];
                if (!this.currentAction || this.currentAction.getClip().name !== stalkAnim) {
                    this.playAnim(stalkAnim, 0.5);
                }
            }
            else {
                if (this.actionCooldown <= 0) {
                    this.state = "attack";
                    this.playRandomAnim(this.anims.attacks, 0.1);
                    this.actionCooldown = 1.5;
                    this.stateTimer = 0.8;
                    player.rigidBody.applyImpulse({ x: dirToPlayer.x * 5, y: 0, z: dirToPlayer.z * 5 }, true);
                }
            }
        }

        if (this.state !== "jump" && this.state !== "attack") {
            const avoidance = this.calculateAvoidance(dirToPlayer);
            const finalDir = avoidance.dir;

            if (avoidance.shouldJump && this.actionCooldown <= 0) {
                this.state = "jump";
                this.actionCooldown = 1.0;
                this.playAnim(this.anims.jump, 0.2);

                this.rigidBody.applyImpulse({
                    x: finalDir.x * desiredSpeed * 1.5,
                    y: 12,
                    z: finalDir.z * desiredSpeed * 1.5
                }, true);
            }

            if (!isNaN(finalDir.x) && isFinite(desiredSpeed) && this.state !== "jump") {
                this.rigidBody.setLinvel({
                    x: finalDir.x * desiredSpeed,
                    y: currentVel.y,
                    z: finalDir.z * desiredSpeed
                }, true);

                const targetAngle = Math.atan2(finalDir.x, finalDir.z);
                const targetQuat = new this.engine.THREE.Quaternion().setFromAxisAngle(
                    new this.engine.THREE.Vector3(0, 1, 0), targetAngle
                );
                const rbRot = this.rigidBody.rotation();
                this.currentQuat.set(rbRot.x, rbRot.y, rbRot.z, rbRot.w);
                this.currentQuat.slerp(targetQuat, Math.min(dt * this.turnSpeed, 1.0));
                this.rigidBody.setRotation(this.currentQuat, true);
            }
        }
    }
}








export class BoxInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);
        this.options = options;
        this.materialDef = this.engine.get_material(options.material || 'default');

        this.size = options.scale ? { x: options.scale, y: options.scale, z: options.scale } : options.size ?? { x: 1, y: 1, z: 1 };
        this.position = options.position ?? { x: 0, y: 5, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };
        this.color = options.color ?? 0xffffff;
        this.static = options.static ?? this.materialDef.static;
        this.uvSettings = options.uv || {};
        this.sides = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    }

    _prepareMaterialForSide(sideName) {
        const sideUV = this.uvSettings[sideName] ?? { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 } };
        const mat = new this.engine.THREE.MeshStandardMaterial({ color: this.color });

        if (this.materialDef.textures.diffuse) {
            const tex = this.engine.get_texture(this.materialDef.textures.diffuse).clone();
            tex.wrapS = tex.wrapT = this.engine.THREE.RepeatWrapping;
            tex.repeat.set(sideUV.scale?.x ?? 1, sideUV.scale?.y ?? 1);
            tex.offset.set(sideUV.offset?.x ?? 0, sideUV.offset?.y ?? 0);
            tex.needsUpdate = true;
            mat.map = tex;
        }
        return mat;
    }

    init() {
        if (this.object3D) return;
        const geo = new this.engine.THREE.BoxGeometry(this.size.x, this.size.y, this.size.z);
        const mats = this.sides.map(side => this._prepareMaterialForSide(side));

        this.object3D = new this.engine.THREE.Mesh(geo, mats);
        this.object3D.castShadow = this.object3D.receiveShadow = true;
        this.object3D.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
        this.scene.add(this.object3D);

        const rbDesc = this.static ? this.engine.rapier.RigidBodyDesc.fixed() : this.engine.rapier.RigidBodyDesc.dynamic();
        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z)
            .setRotation(this.object3D.quaternion);
        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };

        const col = this.engine.rapier.ColliderDesc.cuboid(this.size.x / 2, this.size.y / 2, this.size.z / 2)
            .setFriction(this.materialDef.physics.friction)
            .setRestitution(this.materialDef.physics.restitution)
            .setDensity(this.materialDef.physics.density);
        this.world.createCollider(col, this.rigidBody);
    }
}





export class PlaneInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);
        this.options = options;
        this.materialDef = this.engine.get_material(options.material || 'default');

        this.size = options.size ?? { x: 10, y: 10, z: 0.05 };
        this.position = options.position ?? { x: 0, y: 0, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };
        this.color = options.color ?? 0xffffff;
        this.static = options.static ?? true;
        this.uvSettings = options.uv || {};
    }

    init() {
        if (this.object3D) return;
        const geo = new this.engine.THREE.PlaneGeometry(this.size.x, this.size.y);

        const uv = this.uvSettings.top || { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 } };
        const mat = new this.engine.THREE.MeshStandardMaterial({ color: this.color, side: this.engine.THREE.DoubleSide });

        if (this.materialDef.textures.diffuse) {
            const tex = this.engine.get_texture(this.materialDef.textures.diffuse).clone();
            tex.wrapS = tex.wrapT = this.engine.THREE.RepeatWrapping;
            tex.repeat.set(uv.scale.x, uv.scale.y);
            tex.needsUpdate = true;
            mat.map = tex;
        }

        this.object3D = new this.engine.THREE.Mesh(geo, mat);
        this.object3D.position.set(this.position.x, this.position.y, this.position.z);
        this.object3D.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
        this.object3D.receiveShadow = true;
        this.scene.add(this.object3D);

        const rbDesc = this.engine.rapier.RigidBodyDesc.fixed().setTranslation(this.position.x, this.position.y, this.position.z);
        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z)
            .setRotation(this.object3D.quaternion);

        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };

        const col = this.engine.rapier.ColliderDesc.cuboid(this.size.x / 2, this.size.y / 2, (this.size.z ?? 0.05) / 2);
        col.setFriction(this.materialDef.physics.friction).setRestitution(this.materialDef.physics.restitution);
        this.world.createCollider(col, this.rigidBody);
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

        const sun = new engine.THREE.DirectionalLight(0xffffff, 8);
        sun.position.set(14, 22, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.setScalar(8182);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 90;
        const shadowSize = 30;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowSize;
        sun.shadow.camera.right = sun.shadow.camera.top = shadowSize;
        this.scene.add(sun);
        this.sun = sun;

        this.sceneFolder = this.engine.gui.addFolder('Scene');
        this.sceneFolder.close();

        const sunFolder = this.sceneFolder.addFolder('Sun / Directional Light');

        const helper = new this.engine.THREE.CameraHelper(sun.shadow.camera);
        this.scene.add(helper);
        helper.visible = false;
        sunFolder.add(helper, 'visible').name('Show Shadow Box');

        sunFolder.add(sun, 'intensity', 0, 50).name('Intensity');
        const sunColor = { color: sun.color.getHex() };
        sunFolder.addColor(sunColor, 'color').name('Color').onChange((val) => sun.color.set(val));

        sunFolder.add(sun.position, 'x', -50, 50).name('Position X');
        sunFolder.add(sun.position, 'y', 0, 50).name('Position Y');
        sunFolder.add(sun.position, 'z', -50, 50).name('Position Z');

        const shadowFolder = sunFolder.addFolder('Shadow Advanced Settings');

        const shadowRes = {
            resolution: sun.shadow.mapSize.x
        };
        shadowFolder.add(shadowRes, 'resolution', [256, 512, 1024, 2048, 4096, 8182, 10000, 12000, 16364, 32000, 64000, 128000])
            .name('Shadow Resolution')
            .onChange((val) => {
                sun.shadow.mapSize.setScalar(val);
                sun.shadow.map.dispose();
                sun.shadow.map = null;
            });

        shadowFolder.add(sun.shadow, 'bias', -0.005, 0.005).step(0.0001).name('Shadow Bias');
        shadowFolder.add(sun.shadow, 'normalBias', -0.05, 0.05).step(0.001).name('Normal Bias');
        shadowFolder.add(sun.shadow, 'radius', 0, 10).name('Blur Radius (PCF)');

        const scamFolder = shadowFolder.addFolder('Shadow Camera Bounds');
        scamFolder.add(sun.shadow.camera, 'left', -100, 0).onChange(() => sun.shadow.camera.updateProjectionMatrix());
        scamFolder.add(sun.shadow.camera, 'right', 0, 100).onChange(() => sun.shadow.camera.updateProjectionMatrix());
        scamFolder.add(sun.shadow.camera, 'top', 0, 100).onChange(() => sun.shadow.camera.updateProjectionMatrix());
        scamFolder.add(sun.shadow.camera, 'bottom', -100, 0).onChange(() => sun.shadow.camera.updateProjectionMatrix());
        scamFolder.add(sun.shadow.camera, 'near', 0.1, 50).onChange(() => sun.shadow.camera.updateProjectionMatrix());
        scamFolder.add(sun.shadow.camera, 'far', 1, 500).onChange(() => sun.shadow.camera.updateProjectionMatrix());
        scamFolder.close();

        shadowFolder.close();

        sunFolder.close();

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

        const camFolder = this.sceneFolder.addFolder('Camera');
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
        this.eventQueue = new engine.rapier.EventQueue();

        this.player = null;

        // --- DEBUG RENDERING ---
        this.debugEnabled = false;
        this.sceneFolder.add(this, 'debugEnabled').name('Debug render');
        this.debugMesh = new engine.THREE.LineSegments(
            new engine.THREE.BufferGeometry(),
            new engine.THREE.LineBasicMaterial({ color: 0xff0000, vertexColors: false })
        );
        this.debugMesh.frustumCulled = false;
        this.scene.add(this.debugMesh);

        this.raycaster = new engine.THREE.Raycaster();
        this.raycasting = false;
        this.raycastTimer = 0;
        this.raycastDelay = 0.1;

        this.sceneFolder.add(this, 'raycasting').name('Raycasted target outline');
        this.sceneFolder.add(this, 'raycastDelay', 0.005, 0.2).name('Raycasted target outline delay');

        this.running = true;
        this.instances = new Map();
    }


    // skybox functions

    set_hdri(name, exposure = 1.0) {
        const hdri = this.engine.get_hdri(name);
        if (!hdri) return;
        this.scene.background = hdri;
        this.scene.environment = hdri;
        this.engine.renderer.toneMappingExposure = exposure;
    }


    // property management

    set_camera_position(x, y, z) {
        this.camera.position.set(x, y, z);
    }


    // physics management

    handleCollision(h1, h2) {
        const col1 = this.world.getCollider(h1);
        const col2 = this.world.getCollider(h2);
        if (!col1 || !col2) return;

        const body1 = col1.parent();
        const body2 = col2.parent();
        const inst1 = body1?.userData?.instance;
        const inst2 = body2?.userData?.instance;
        if (!inst1 || !inst2) return;

        const v1 = body1.linvel();
        const v2 = body2.linvel();

        const impactForce = Math.sqrt(
            Math.pow(v1.x - v2.x, 2) +
            Math.pow(v1.y - v2.y, 2) +
            Math.pow(v1.z - v2.z, 2)
        );

        if (impactForce > 1.5) {
            [inst1, inst2].forEach(inst => {
                if (inst.materialDef && inst.materialDef.sounds.impact) {
                    const pos = inst.rigidBody.translation();

                    this.engine.play_sound_3d(inst.materialDef.sounds.impact, pos, {
                        volume: Math.min(impactForce * 0.1, 1.0),
                        refDistance: 2.0
                    });
                }
            });
        }

        if (inst1.onCollide) {
            inst1.onCollide(inst1, inst2, impactForce);
        }
        if (inst2.onCollide) {
            inst2.onCollide(inst2, inst1, impactForce);
        }
    }


    // instance management

    add_instance(name, InstanceClass, params = {}) {
        const instance = new InstanceClass(this.engine, this, params);
        this.instances.set(name, instance);
        instance.init();
        if (instance.object3D) instance.object3D.userData.instanceId = name;
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

    get_first_instance_of_class(instance_class) {
        for (const instance of this.instances.values()) {
            if (instance instanceof instance_class) {
                return instance;
            }
        }
        return null;
    }


    // lifecycle

    init() {
        for (const instance of this.instances.values()) {
            instance.init();
        }
    }

    render(alpha, renderDt) {
        if (this.engine.outlinePass) {
            const time = performance.now() * 0.007;
            const pulse = 4.0 + Math.sin(time) * 1.0;

            this.engine.outlinePass.edgeStrength = pulse;
            this.engine.outlinePass.edgeGlow = 0.5 + Math.sin(time) * 0.2;
            this.engine.outlinePass.edgeThickness = 1.0;
        }

        this.camera.rotation.y = this.engine.look.yaw;
        this.camera.rotation.x = this.engine.look.pitch;

        if (!this.player) { this.player = this.get_first_instance_of_class(Player) }
        if (!this.player) { this.player = "no-player" }

        if (this.engine.engine_mode === "game" && this.player) {
            const player = this.player;
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

        for (const instance of this.instances.values()) {
            instance.sync_with_physics(alpha);
        }

        this.scene.updateMatrixWorld(true);

        this.raycastTimer += renderDt;

        if (this.raycastTimer > this.raycastDelay && this.raycasting) {
            this.raycastTimer = 0;

            this.raycaster.setFromCamera(this.engine.look.locked ? { x: 0, y: 0 } : this.engine.mouse, this.camera);

            const targetableObjects = [];
            for (const instance of this.instances.values()) {
                if (instance.object3D) targetableObjects.push(instance.object3D);
            }

            const intersects = this.raycaster.intersectObjects(targetableObjects, true);

            if (intersects.length > 0) {
                let object = intersects[0].object;

                let rootObject = object;
                while (rootObject.parent && !rootObject.userData.instanceId) {
                    rootObject = rootObject.parent;
                }

                if (this.engine.outlinePass) {
                    this.engine.outlinePass.selectedObjects = [rootObject];
                }

                this.engine.canvas3D.style.cursor = 'pointer';
            } else {
                if (this.engine.outlinePass) {
                    this.engine.outlinePass.selectedObjects = [];
                }
                this.engine.canvas3D.style.cursor = 'default';
            }
        }

        if (Math.abs(this.camera.fov - this.targetFOV) > 0.1) {
            this.camera.fov = this.engine.THREE.MathUtils.lerp(this.camera.fov, this.targetFOV, 0.15);
            this.camera.updateProjectionMatrix();
        }

        if (this.debugEnabled) {
            const { vertices, colors } = this.world.debugRender();
            this.debugMesh.geometry.setAttribute('position', new this.engine.THREE.BufferAttribute(vertices, 3));
            this.debugMesh.geometry.setAttribute('color', new this.engine.THREE.BufferAttribute(colors, 4));
            this.debugMesh.visible = true;
        } else {
            this.debugMesh.visible = false;
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
        this.world.step(this.eventQueue);

        this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            if (started) {
                this.handleCollision(handle1, handle2);
            }
        });

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
    constructor({ rapier, THREE, Stats, GLTFLoader, RGBELoader, clone, gui, ShaderPass, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, BokehPass, GTAOPass, SMAAPass, OutlinePass, TAARenderPass }) {

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
        this.ShaderPass = ShaderPass;
        this.EffectComposer = EffectComposer;
        this.RenderPass = RenderPass;
        this.UnrealBloomPass = UnrealBloomPass;
        this.OutputPass = OutputPass;
        this.BokehPass = BokehPass;
        this.GTAOPass = GTAOPass;
        this.SMAAPass = SMAAPass;
        this.OutlinePass = OutlinePass;
        this.TAARenderPass = TAARenderPass;

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
        this.resolutionScale = 1.0;
        this.postProcessEnabled = true;

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
            hdris: new Map(),
            materials: new Map()
        }

        this.loadingContainer = null;
        this.loadingBar = null;
        this.statusText = null;

        // stats init
        this.stats = new Stats();
        this.stats.showPanel(0);
        const statsDom = this.stats.dom;
        statsDom.style.position = 'fixed';
        statsDom.style.top = '0px';
        statsDom.style.left = '0px';
        statsDom.style.zIndex = '100000';
        statsDom.style.display = 'block';
        document.body.appendChild(statsDom);

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
        });

        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (this.isMobile) {
            this.createMobileInterface();
        }
    }


    // touch controlls

    createMobileInterface() {
        const mobileUI = document.createElement('div');
        mobileUI.id = 'mobileInterface';
        Object.assign(mobileUI.style, {
            position: 'fixed',
            top: '0px',
            left: '0px',
            width: '100%',
            height: '100%',
            zIndex: '1000',
            pointerEvents: 'none',
            userSelect: 'none',
            webkitUserSelect: 'none',
            touchAction: 'none'
        });

        const leftZone = document.createElement('div');
        Object.assign(leftZone.style, {
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            width: '150px',
            height: '150px',
            pointerEvents: 'auto'
        });

        const joyWrapper = document.createElement('div');
        Object.assign(joyWrapper.style, {
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            position: 'relative'
        });

        const joyKnob = document.createElement('div');
        Object.assign(joyKnob.style, {
            width: '50px',
            height: '50px',
            background: 'rgba(255, 255, 255, 0.4)',
            borderRadius: '50%',
            position: 'absolute',
            top: '35px',
            left: '35px'
        });

        joyWrapper.appendChild(joyKnob);
        leftZone.appendChild(joyWrapper);

        const rightZone = document.createElement('div');
        Object.assign(rightZone.style, {
            position: 'absolute',
            top: '0px',
            right: '0px',
            width: '50%',
            height: '100%',
            pointerEvents: 'auto'
        });

        const jumpBtn = document.createElement('div');
        jumpBtn.innerHTML = '<p style="color:white; margin:0; font-weight:bold; font-size:12px;">JUMP</p>';
        Object.assign(jumpBtn.style, {
            position: 'absolute',
            bottom: '40px',
            right: '40px',
            width: '80px',
            height: '80px',
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            border: '1px solid rgba(255,255,255,0.2)'
        });

        rightZone.appendChild(jumpBtn);
        mobileUI.appendChild(leftZone);
        mobileUI.appendChild(rightZone);
        document.body.appendChild(mobileUI);

        this.setupJoystickLogic(joyWrapper, joyKnob);
        this.setupTouchLookLogic(rightZone);
        this.setupJumpLogic(jumpBtn);
    }

    setupTouchLookLogic(zone) {
        let lookTouchId = null;
        let lastTouchX = 0;
        let lastTouchY = 0;

        zone.addEventListener('touchstart', (e) => {
            if (e.target.closest('p') || e.target.style.borderRadius === '50%') return;

            if (lookTouchId === null) {
                const touch = e.changedTouches[0];
                lookTouchId = touch.identifier;
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
            }
        }, { passive: false });

        zone.addEventListener('touchmove', (e) => {
            const touch = Array.from(e.touches).find(t => t.identifier === lookTouchId);
            if (!touch) return;

            e.preventDefault();

            const movementX = touch.clientX - lastTouchX;
            const movementY = touch.clientY - lastTouchY;

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;

            let sens = this.look.sensitivity * 2.5;
            if (this.activeScene && this.activeScene.camera) {
                sens *= (this.activeScene.camera.fov / 75);
            }

            this.look.yaw -= movementX * sens;
            this.look.pitch -= movementY * sens;

            this.look.pitch = this.THREE.MathUtils.clamp(
                this.look.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01
            );

            this.look.locked = true;
        }, { passive: false });

        zone.addEventListener('touchend', (e) => {
            const touchEnded = Array.from(e.changedTouches).some(t => t.identifier === lookTouchId);
            if (touchEnded) lookTouchId = null;
        });

        zone.addEventListener('touchcancel', (e) => {
            const touchEnded = Array.from(e.changedTouches).some(t => t.identifier === lookTouchId);
            if (touchEnded) lookTouchId = null;
        });
    }

    setupJoystickLogic(wrapper, knob) {
        const rect = wrapper.getBoundingClientRect();
        const center = { x: rect.width / 2, y: rect.height / 2 };
        const maxRadius = rect.width / 2;
        let joystickTouchId = null;

        const handleTouch = (e) => {
            e.preventDefault();

            let touch;
            if (joystickTouchId === null) {
                touch = e.changedTouches[0];
                joystickTouchId = touch.identifier;
            } else {
                touch = Array.from(e.touches).find(t => t.identifier === joystickTouchId);
            }

            if (!touch) return;

            const x = touch.clientX - rect.left - center.x;
            const y = touch.clientY - rect.top - center.y;

            const dist = Math.sqrt(x * x + y * y);
            const force = Math.min(dist, maxRadius);
            const angle = Math.atan2(y, x);

            const moveX = Math.cos(angle) * force;
            const moveY = Math.sin(angle) * force;

            knob.style.transform = `translate(${moveX}px, ${moveY}px)`;

            const normX = moveX / maxRadius;
            const normY = moveY / maxRadius;

            this.input.left = normX < -0.3;
            this.input.right = normX > 0.3;
            this.input.forward = normY < -0.3;
            this.input.back = normY > 0.3;
        };

        const resetJoy = (e) => {
            const touchEnded = Array.from(e.changedTouches).some(t => t.identifier === joystickTouchId);
            if (!touchEnded) return;

            joystickTouchId = null;
            knob.style.transform = `translate(0px, 0px)`;
            this.input.forward = false;
            this.input.back = false;
            this.input.left = false;
            this.input.right = false;
        };

        wrapper.addEventListener('touchstart', handleTouch, { passive: false });
        wrapper.addEventListener('touchmove', handleTouch, { passive: false });
        wrapper.addEventListener('touchend', resetJoy);
        wrapper.addEventListener('touchcancel', resetJoy);
    }

    setupJumpLogic(btn) {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.up = true;
        });
        btn.addEventListener('touchend', () => {
            this.input.up = false;
        });
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

        if (this.pixelPass) {
            this.pixelPass.uniforms["resolution"].value.set(
                this.width * this.dpr,
                this.height * this.dpr
            );
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
                if (this.isMobile) return;
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
                if (this.isMobile) return;
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
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = this.THREE.PCFShadowMap;
        this.composer = new this.EffectComposer(this.renderer);
    }

    update_post_process() {
        if (!this.activeScene) return;

        this.composer.passes = [];

        // Main render
        const renderPass = new this.RenderPass(this.activeScene.scene, this.activeScene.camera);
        this.composer.addPass(renderPass);


        // GTAO Shadows
        this.gtaoPass = new this.GTAOPass(
            this.activeScene.scene,
            this.activeScene.camera,
            this.width,
            this.height
        );
        this.gtaoPass.enabled = false;
        this.gtaoPass.output = this.GTAOPass.OUTPUT.Default;
        this.gtaoPass.intensity = 1.0;
        this.gtaoPass.radius = 0.5;
        this.gtaoPass.distanceExponent = 1.5;
        this.gtaoPass.samples = 32;
        this.composer.addPass(this.gtaoPass);


        // TAA
        const taaPass = new this.TAARenderPass(this.activeScene.scene, this.activeScene.camera);
        taaPass.enabled = false;
        taaPass.unbiased = true;
        taaPass.sampleLevel = 2;
        this.composer.addPass(taaPass);


        // Outline
        this.outlinePass = new this.OutlinePass(
            new this.THREE.Vector2(this.width * this.dpr, this.height * this.dpr), // Přidáno * this.dpr
            this.activeScene.scene,
            this.activeScene.camera
        );
        this.outlinePass.enabled = false;
        this.outlinePass.edgeStrength = 3;
        this.outlinePass.edgeGlow = 1.2;
        this.outlinePass.edgeThickness = 1;
        this.outlinePass.visibleEdgeColor.set('#37ff00');
        this.outlinePass.hiddenEdgeColor.set('#000000');
        this.outlinePass.renderToScreen = true;
        this.outlinePass.usePatternTexture = false;
        this.outlinePass.overlayMaterial.blending = this.THREE.AdditiveBlending;
        this.composer.addPass(this.outlinePass);


        // Bloom
        const bloomPass = new this.UnrealBloomPass(
            new this.THREE.Vector2(this.width, this.height),
            0.1, 0.1, 1
        );
        bloomPass.enabled = false;
        this.composer.addPass(bloomPass);
        this.activeScene.bokehPass = new this.BokehPass(this.activeScene.scene, this.activeScene.camera, {
            focus: 10.0,
            aperture: 0.001,
            maxblur: 0
        });
        this.composer.addPass(this.activeScene.bokehPass);


        // SMAA
        const smaaPass = new this.SMAAPass(this.width * this.dpr, this.height * this.dpr);
        smaaPass.enabled = false;
        this.composer.addPass(smaaPass);


        // BlackHole
        const BlackHoleShader = {
            uniforms: {
                "tDiffuse": { value: null },
                "time": { value: 0.0 },
                "resolution": { value: null },
                "cameraPos": { value: null },
                "cameraInverseViewProj": { value: null },
                "cameraViewProj": { value: null },
                "bhPos": { value: null },
                "bhRotation": { value: new this.THREE.Matrix4() },
                "bhMass": { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform vec2 resolution;
                uniform vec3 cameraPos;
                uniform mat4 cameraInverseViewProj;
                uniform mat4 cameraViewProj;
                uniform vec3 bhPos;
                uniform float bhMass;
                uniform mat4 bhRotation;
                
                varying vec2 vUv;
                
                #define PI 3.14159265359

                float curve(float x) { return x * x * (3.0 - 2.0 * x); }
                float pcurve(float x){ float x2 = x * x; return 12.207 * x2 * x2 * (1.0 - x); }

                // Šum pro rozbití pruhování (banding) při raymarchingu
                float InterleavedGradientNoise(vec2 uv) {
                    vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
                    return fract(magic.z * fract(dot(uv, magic.xy)));
                }

                float hash(vec3 p) {
                    p = fract(p * vec3(443.897, 441.423, 437.195));
                    p += dot(p, p.yzx + 19.19);
                    return fract((p.x + p.y) * p.z);
                }

                float Calculate3DNoise(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                                mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                            mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                                mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
                }

                float CalculateCloudFBM(vec3 position, vec3 shift){
                    float accum = 0.0;
                    float alpha = 0.5;
                    vec3 p = position;
                    for (int i = 0; i < 4; i++) {
                        accum += alpha * Calculate3DNoise(p);
                        p = (p + shift) * 2.5;
                        alpha *= 0.87;
                    }
                    return accum + (0.87 / 2.5) / 4.0;
                }

                vec3 Blackbody(float temp) {
                    vec3 color = vec3(255.0);
                    temp /= 100.0;
                    if (temp <= 66.0) {
                        color.r = 255.0;
                        color.g = clamp(99.4708025861 * log(temp) - 161.1195681661, 0.0, 255.0);
                        if (temp <= 19.0) color.b = 0.0;
                        else color.b = clamp(138.5177312231 * log(temp - 10.0) - 305.0447927307, 0.0, 255.0);
                    } else {
                        color.r = clamp(329.698727446 * pow(temp - 60.0, -0.1332047592), 0.0, 255.0);
                        color.g = clamp(288.1221695283 * pow(temp - 60.0, -0.0755148492), 0.0, 255.0);
                        color.b = 255.0;
                    }
                    return color / 255.0;
                }

                mat3 RotateMatrix(float x, float y, float z){
                    mat3 matx = mat3(1.0, 0.0, 0.0, 0.0, cos(x), sin(x), 0.0, -sin(x), cos(x));
                    mat3 maty = mat3(cos(y), 0.0, -sin(y), 0.0, 1.0, 0.0, sin(y), 0.0, cos(y));
                    mat3 matz = mat3(cos(z), sin(z), 0.0, -sin(z), cos(z), 0.0, 0.0, 0.0, 1.0);
                    return maty * matx * matz;
                }

                void WarpSpace(inout vec3 rayDir, vec3 rayPos, vec3 center){
                    vec3 diff = center - rayPos;
                    float dist2 = dot(diff, diff);
                    vec3 dirToCenter = normalize(diff);
                    // Zvýšením čísla 0.2 na vyšší (např. 0.5) posílíš efekt ohybu z dálky
                    float warpFactor = bhMass / (dist2 + 0.000001);
                    rayDir = normalize(rayDir + dirToCenter * warpFactor * 0.5); 
                }

                vec3 getRayDir(vec2 uv) {
                    vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
                    vec4 worldPos = cameraInverseViewProj * ndc;
                    worldPos.xyz /= worldPos.w;
                    return normalize(worldPos.xyz - cameraPos);
                }

                vec2 getScreenUV(vec3 dir) {
                    vec4 ndc = cameraViewProj * vec4(cameraPos + dir * 100.0, 1.0);
                    return (ndc.xy / ndc.w) * 0.5 + 0.5;
                }

                void main() {
                    vec3 rayDir = getRayDir(vUv);
                    vec3 rayPos = cameraPos;
                    vec3 center = bhPos;
                    
                    float transmittance = 1.0;
                    vec3 result = vec3(0.0);
                    
                    mat3 rotation = transpose(mat3(bhRotation));
                    
                    // Nastavení kroků přesně podle Minecraftu
                    const float steps = 70.0;
                    const float rSteps = 1.0 / steps;
                    const float stepLength = 0.5;

                    const float discRadius = 2.25;
                    const float discWidth = 3.5;
                    const float discInner = discRadius - discWidth * 0.5;

                    float distToCenter = length(center - cameraPos);
                    float influenceRadius = bhMass * 250.0;
                    
                    // Dithering šum zabrání vzniku ostrých kruhů (banding) při průchodu plynem
                    float dither = InterleavedGradientNoise(gl_FragCoord.xy);
                    
                    vec3 L = center - cameraPos;
                    if (dot(normalize(L), rayDir) > 0.0 || distToCenter < influenceRadius) {
                        
                        if (distToCenter > influenceRadius) {
                            rayPos += rayDir * (distToCenter - influenceRadius);
                        }

                        // Posunutí startu paprsku o šum
                        rayPos += rayDir * (stepLength * dither);

                        for(int i = 0; i < int(steps); i++){
                            if(transmittance < 0.0001) break;

                            WarpSpace(rayDir, rayPos, center);
                            rayPos += rayDir * stepLength;

                            vec3 localPos = rayPos - center;
                            vec3 discPos = rotation * localPos;

                            float r = length(discPos);
                            // Přesná náhrada za atan2 z MC 
                            float p = atan(-discPos.z, -discPos.x);
                            float h = discPos.y;

                            // Event horizon záchyt pro zrychlení a ostřejší jádro
                            if (length(localPos) < bhMass * 0.6) {
                                transmittance = 0.0;
                                break;
                            }

                            float radialGradient = 1.0 - clamp((r - discInner) / discWidth * 0.5, 0.0, 1.0);
                            float dist = abs(h);
                            float discThickness = 0.1 * radialGradient;

                            float fr = abs(r - discInner) + 0.4;
                            float fade = fr * fr * fr * fr * 0.04;
                            float bloomFactor = 1.0 / (h * h * 40.0 + fade + 0.00002);
                            bloomFactor *= clamp(2.0 - abs(dist) / discThickness, 0.0, 1.0);
                            bloomFactor = bloomFactor * bloomFactor;

                            float dr = pcurve(radialGradient);
                            float density = dr * clamp(1.0 - abs(dist) / discThickness, 0.0, 1.0);
                            density = clamp(density * 0.7, 0.0, 1.0);
                            density = clamp(density + bloomFactor * 0.1, 0.0, 1.0);

                            if (density > 0.0001){
                                vec3 discCoord = vec3(r, p * (1.0 - radialGradient * 0.5), h * 0.1) * 3.5;
                                float fbm = CalculateCloudFBM(discCoord, time * vec3(0.1, 0.07, 0.0));
                                
                                // Minecraft umocňuje FBM na 4. pro velmi detailní a kontrastní mračna
                                fbm = fbm * fbm;
                                fbm = fbm * fbm; 
                                density *= fbm * dr;

                                float gr = 1.0 - radialGradient;
                                float glowStrength = 1.0 / (gr * gr * gr * gr * 400.0 + 0.002);
                                vec3 glow = Blackbody(2700.0 + glowStrength * 50.0) * glowStrength;

                                // Dopplerův efekt (posuv k modré na jedné straně, k červené na druhé)
                                glow *= sin(p - 1.07) * 0.75 + 1.0;
                                
                                float stepTransmittance = exp2(-density * 7.0);
                                result += (1.0 - stepTransmittance) * transmittance * glow;
                                transmittance *= stepTransmittance;
                            }

                            // Vnitřní fotonový prstenec (přesný torus SDF)
                            float torusDist = length(vec2(length(discPos.xz) - 1.0, discPos.y + 0.05));
                            float bloomDisc = 1.0 / (pow(torusDist, 3.5) + 0.001);
                            vec3 col = Blackbody(12000.0);
                            bloomDisc *= step(0.5, r);

                            result += col * bloomDisc * 0.1 * transmittance;
                        }
                    }

                    result *= rSteps;
                    
                    vec2 bentUV = getScreenUV(rayDir);
                    bentUV = clamp(bentUV, 0.001, 0.999);
                    vec4 bgColor = texture2D(tDiffuse, bentUV);

                    // Pokud paprsek pohltila díra, pozadí bude černé
                    if (transmittance < 0.001) bgColor = vec4(0.0, 0.0, 0.0, 1.0);

                    gl_FragColor = vec4(bgColor.rgb * transmittance + result, 1.0);
                }
            `
        };
        this.blackHolePass = new this.ShaderPass(BlackHoleShader);
        this.blackHolePass.uniforms["resolution"].value = new this.THREE.Vector2(this.width * this.dpr, this.height * this.dpr);
        this.blackHolePass.uniforms["cameraPos"].value = new this.THREE.Vector3();
        this.blackHolePass.uniforms["bhPos"].value = new this.THREE.Vector3(0, 10, -20);
        this.blackHolePass.uniforms["cameraInverseViewProj"].value = new this.THREE.Matrix4();
        this.blackHolePass.uniforms["cameraViewProj"].value = new this.THREE.Matrix4();
        this.blackHolePass.enabled = false;
        this.composer.addPass(this.blackHolePass);


        // Pixel
        const PixelShader = {
            uniforms: {
                "tDiffuse": { value: null },
                "resolution": { value: new this.THREE.Vector2() },
                "pixelSize": { value: 3.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 resolution;
                uniform float pixelSize;
                varying vec2 vUv;
    
                void main() {
                    vec2 dxy = vec2(pixelSize * 1.5, pixelSize) / resolution;
                    vec2 coord = dxy * (floor(vUv / dxy) + 0.5);
                    gl_FragColor = texture2D(tDiffuse, coord);
                }
            `
        }
        this.pixelPass = new this.ShaderPass(PixelShader);
        this.pixelPass.uniforms["resolution"].value.set(this.width * this.dpr, this.height * this.dpr);
        this.pixelPass.uniforms["pixelSize"].value = 1.0;
        this.composer.addPass(this.pixelPass);
        this.pixelPass.enabled = false;


        // Final
        const outputPass = new this.OutputPass();
        this.composer.addPass(outputPass);

        if (this.gui) {
            const posteffectFolder = this.gui.addFolder('PostEffects');
            posteffectFolder.close();

            posteffectFolder.add(this, 'postProcessEnabled').name('Post-Process Enabled');

            const pixelFolder = posteffectFolder.addFolder('Pixel Effect');
            pixelFolder.add(this.pixelPass, 'enabled').name('Enabled');
            pixelFolder.add(this.pixelPass.uniforms["pixelSize"], 'value', 1, 60, 1).name('Pixel Size');
            pixelFolder.close();

            const bhFolder = posteffectFolder.addFolder('Black Hole Effect');
            bhFolder.add(this.blackHolePass, 'enabled').name('Enabled');
            bhFolder.add(this.blackHolePass.uniforms["bhMass"], 'value', 0.0, 5.0).name('Mass / Gravity');
            bhFolder.add(this.blackHolePass.uniforms["bhPos"].value, 'x', -100, 100).name('Position X');
            bhFolder.add(this.blackHolePass.uniforms["bhPos"].value, 'y', -50, 100).name('Position Y');
            bhFolder.add(this.blackHolePass.uniforms["bhPos"].value, 'z', -100, 100).name('Position Z');
            bhFolder.close();

            const bloomFolder = posteffectFolder.addFolder('Bloom');
            bloomFolder.add(bloomPass, 'enabled').name('Enabled');
            bloomFolder.add(bloomPass, 'strength', 0, 3);
            bloomFolder.add(bloomPass, 'radius', 0, 1);
            bloomFolder.add(bloomPass, 'threshold', 0, 1);
            bloomFolder.close();

            const gtaoFolder = posteffectFolder.addFolder('GTAO Shadows');
            gtaoFolder.add(this.gtaoPass, 'enabled').name('Enabled');
            gtaoFolder.add(this.gtaoPass, 'intensity', 0, 4).name('Intensity');
            gtaoFolder.add(this.gtaoPass, 'radius', 0, 5).name('Radius');
            gtaoFolder.add(this.gtaoPass, 'distanceExponent', 1, 4).name('Distance exponent');
            gtaoFolder.add(this.gtaoPass, 'samples', 8, 64, 1).name('Samples');
            gtaoFolder.close();

            const taaFolder = posteffectFolder.addFolder('TAA (Anti-aliasing)');
            taaFolder.add(taaPass, 'enabled').name('Enabled');
            taaFolder.add(taaPass, 'sampleLevel', {
                'Level 0 (Off)': 0,
                'Level 1': 1,
                'Level 2': 2,
                'Level 3': 3,
                'Level 4': 4,
                'Level 5': 5
            }).name('Sample Level');
            taaFolder.add(taaPass, 'unbiased').name('Unbiased Accumulation');
            taaFolder.close();

            const outlineFolder = posteffectFolder.addFolder('Outline');
            outlineFolder.add(this.outlinePass, 'enabled').name('Enabled');
            outlineFolder.add(this.outlinePass, 'edgeStrength', 0, 100);
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

    add_material(material) {
        this.assets.materials.set(material.name, material);
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

    get_material(name) {
        if (name == "default") {
            return new Material();
        }
        return this.assets.materials.get(name) || this.get_material("default");
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


    // sound management

    play_sound(name, options = {}) {
        const buffer = this.get_sound(name);
        if (!buffer || !this.activeScene) return null;

        const sound = new this.THREE.Audio(this.activeScene.listener);
        sound.setBuffer(buffer);
        sound.setLoop(options.loop ?? false);
        sound.setVolume(options.volume ?? 1.0);
        sound.play();

        if (!options.loop) {
            sound.source.onended = () => { sound.disconnect(); };
        }

        return sound;
    }

    play_sound_3d(name, position, options = {}) {
        const buffer = this.get_sound(name);
        if (!buffer || !this.activeScene) return null;

        const sound = new this.THREE.PositionalAudio(this.activeScene.listener);
        sound.setBuffer(buffer);
        sound.setRefDistance(options.refDistance ?? 1.0);
        sound.setMaxDistance(options.maxDistance ?? 100.0);
        sound.setLoop(options.loop ?? false);
        sound.setVolume(options.volume ?? 1.0);

        const audioLoaderObject = new this.THREE.Object3D();
        audioLoaderObject.position.set(position.x, position.y, position.z);
        this.activeScene.scene.add(audioLoaderObject);
        audioLoaderObject.add(sound);

        sound.play();

        if (!options.loop) {
            sound.source.onended = () => {
                sound.disconnect();
                this.activeScene.scene.remove(audioLoaderObject);
            };
        }

        return sound;
    }

    stop_sound(sound) {
        if (sound && sound.isPlaying) {
            sound.stop();
            sound.disconnect();
        }
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
            this.stats.begin();

            const renderDt = (time - this.lastTime) / 1000;
            const dt = Math.min(renderDt, 0.1);
            this.lastTime = time;

            this.accumulator += dt;
            this.fps = Math.round(this.fps * 0.9 + (1 / dt) * 0.1);

            while (this.accumulator >= this.fixedTimeStep) {

                // physics and game logic updates
                if (this.activeScene && this.activeScene.world) {
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

                if (this.postProcessEnabled && this.composer) {
                    if (this.blackHolePass && this.blackHolePass.enabled && this.activeScene.camera) {
                        const cam = this.activeScene.camera;
                        this.blackHolePass.uniforms["time"].value = time / 1000;
                        this.blackHolePass.uniforms["cameraPos"].value.copy(cam.position);

                        cam.updateMatrixWorld();
                        const viewProj = new this.THREE.Matrix4();
                        viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

                        this.blackHolePass.uniforms["cameraViewProj"].value.copy(viewProj);
                        this.blackHolePass.uniforms["cameraInverseViewProj"].value.copy(viewProj).invert();
                    }
                    this.composer.render();
                } else {
                    this.renderer.render(this.activeScene.scene, this.activeScene.camera);
                }
            }

            this.stats.end();

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}
