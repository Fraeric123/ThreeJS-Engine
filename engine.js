



export const DEG2RAD = Math.PI / 180;


export const generateRandomHexColor = () => {
    const randomColor = Math.floor(Math.random() * 16777215).toString(16);
    return "#" + randomColor.padStart(6, '0');
};


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
        this.friction = options.friction ?? 0.5;
        this.restitution = options.restitution ?? 0.1;
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
            colDesc.setFriction(this.friction).setRestitution(this.restitution);
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






export class Projectile extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);
        this.options = options;
        this.speed = options.speed || 40;
        this.radius = options.radius || 0.1;
        this.lifeTime = options.lifeTime || 3;
        this.explosionRadius = options.explosionRadius || 5;
        this.explosionForce = options.explosionForce || 15;
        this.color = options.color || 0xffff00;
        
        this.spawnTime = performance.now();
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

        window.addEventListener('mousedown', (e) => { if(e.button === 0) this.isFiring = true; });
        window.addEventListener('mouseup', (e) => { if(e.button === 0) this.isFiring = false; });
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








export class BoxInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);

        this.options = options;
        this.size = options.scale ? { x: options.scale, y: options.scale, z: options.scale } : options.size ?? { x: 1, y: 1, z: 1 };
        this.position = options.position ?? { x: 0, y: 5, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };

        this.sides = ['right', 'left', 'top', 'bottom', 'front', 'back'];

        this.uvSettings = options.uv ?? {};

        this.static = options.static ?? false;
        this.friction = options.friction ?? 0.5;
        this.restitution = options.restitution ?? 0.1;

        this.color = options.color ?? null;
        this.textureKeys = ['diffuseTexture', 'metalnessTexture', 'roughnessTexture', 'normalTexture'];
    }

    _prepareMaterialForSide(sideName) {
        const sideUV = this.uvSettings[sideName] ?? { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 } };
        const materialParams = { color: this.color };

        const mapMapping = {
            diffuseTexture: 'map',
            metalnessTexture: 'metalnessMap',
            roughnessTexture: 'roughnessMap',
            normalTexture: 'normalMap'
        };

        Object.entries(mapMapping).forEach(([optKey, matKey]) => {
            const textureName = this.options[optKey];
            if (textureName) {
                const original = this.engine.get_texture(textureName);
                if (original) {
                    const tex = original.clone();
                    tex.wrapS = tex.wrapT = this.engine.THREE.RepeatWrapping;
                    tex.repeat.set(sideUV.scale?.x ?? 1, sideUV.scale?.y ?? 1);
                    tex.offset.set(sideUV.offset?.x ?? 0, sideUV.offset?.y ?? 0);
                    tex.needsUpdate = true;
                    materialParams[matKey] = tex;
                }
            }
        });

        return new this.engine.THREE.MeshStandardMaterial(materialParams);
    }

    init() {
        if (this.object3D) return;

        const geo = new this.engine.THREE.BoxGeometry(this.size.x, this.size.y, this.size.z);
        geo.computeTangents();

        const materials = this.sides.map(side => this._prepareMaterialForSide(side));

        this.object3D = new this.engine.THREE.Mesh(geo, materials);
        this.object3D.castShadow = true;
        this.object3D.receiveShadow = true;
        this.scene.add(this.object3D);

        const rbDesc = this.static ?
            this.engine.rapier.RigidBodyDesc.fixed() :
            this.engine.rapier.RigidBodyDesc.dynamic();

        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z)
            .setRotation(new this.engine.THREE.Quaternion().setFromEuler(
                new this.engine.THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z)
            ));

        this.rigidBody = this.world.createRigidBody(rbDesc);
        this.rigidBody.userData = { instance: this };

        const collider = this.engine.rapier.ColliderDesc.cuboid(this.size.x / 2, this.size.y / 2, this.size.z / 2)
            .setFriction(this.friction)
            .setRestitution(this.restitution);

        this.world.createCollider(collider, this.rigidBody);
    }

    update(dt) {
        if (!this.static) this.sync_with_physics();
    }
}






export class PlaneInstance extends Instance {
    constructor(engine, gameScene, options = {}) {
        super(engine, gameScene);

        this.options = options;
        this.size = options.size ?? { x: 10, y: 10, z: 0.05 };
        this.position = options.position ?? { x: 0, y: 0, z: 0 };
        this.rotation = {
            x: (options.rotation?.x ?? 0) * (DEG2RAD),
            y: (options.rotation?.y ?? 0) * (DEG2RAD),
            z: (options.rotation?.z ?? 0) * (DEG2RAD)
        };

        this.uvSettings = options.uv ?? {};

        this.static = options.static ?? false;
        this.friction = options.friction ?? 0.5;
        this.restitution = options.restitution ?? 0.1;

        this.color = options.color ?? null;
        this.textureKeys = ['diffuseTexture', 'metalnessTexture', 'roughnessTexture', 'normalTexture'];
    }

    _prepareMaterial() {
        const uv = this.uvSettings.top || this.uvSettings.front || { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 } };
        const materialParams = {
            color: this.color,
            side: this.engine.THREE.DoubleSide
        };

        const mapMapping = {
            diffuseTexture: 'map',
            metalnessTexture: 'metalnessMap',
            roughnessTexture: 'roughnessMap',
            normalTexture: 'normalMap'
        };

        Object.entries(mapMapping).forEach(([optKey, matKey]) => {
            const textureName = this.options[optKey];
            if (textureName) {
                const original = this.engine.get_texture(textureName);
                if (original) {
                    const tex = original.clone();
                    tex.wrapS = tex.wrapT = this.engine.THREE.RepeatWrapping;
                    tex.repeat.set(uv.scale?.x ?? 1, uv.scale?.y ?? 1);
                    tex.offset.set(uv.offset?.x ?? 0, uv.offset?.y ?? 0);
                    tex.needsUpdate = true;
                    materialParams[matKey] = tex;
                }
            }
        });

        return new this.engine.THREE.MeshStandardMaterial(materialParams);
    }

    init() {
        if (this.object3D) return;

        const geo = new this.engine.THREE.PlaneGeometry(this.size.x, this.size.y);
        geo.computeTangents();

        const mat = this._prepareMaterial();
        this.object3D = new this.engine.THREE.Mesh(geo, mat);

        this.object3D.position.set(this.position.x, this.position.y, this.position.z);
        this.object3D.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);

        this.object3D.receiveShadow = true;
        this.scene.add(this.object3D);

        const thickness = this.size.z ?? 0.001;
        const rbDesc = this.static ?
            this.engine.rapier.RigidBodyDesc.fixed() :
            this.engine.rapier.RigidBodyDesc.dynamic();

        rbDesc.setTranslation(this.position.x, this.position.y, this.position.z)
            .setRotation(this.object3D.quaternion);

        this.rigidBody = this.world.createRigidBody(rbDesc);

        const collider = this.engine.rapier.ColliderDesc.cuboid(
            this.size.x / 2,
            this.size.y / 2,
            thickness / 2
        );

        collider.setFriction(this.friction).setRestitution(this.restitution);
        this.world.createCollider(collider, this.rigidBody);
    }

    update(dt) {
        if (!this.static) this.sync_with_physics();
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
        this.postProcessEnabled = false;

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
        this.gtaoPass.output = this.GTAOPass.OUTPUT.Default;
        this.gtaoPass.intensity = 1.0;
        this.gtaoPass.radius = 0.5;
        this.gtaoPass.distanceExponent = 1.5;
        this.gtaoPass.samples = 32;
        this.composer.addPass(this.gtaoPass);


        // TAA
        const taaPass = new this.TAARenderPass(this.activeScene.scene, this.activeScene.camera);
        taaPass.unbiased = true;
        taaPass.sampleLevel = 2;
        this.composer.addPass(taaPass);


        // Outline
        this.outlinePass = new this.OutlinePass(
            new this.THREE.Vector2(this.width * this.dpr, this.height * this.dpr), // Přidáno * this.dpr
            this.activeScene.scene,
            this.activeScene.camera
        );
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
        this.composer.addPass(bloomPass);
        this.activeScene.bokehPass = new this.BokehPass(this.activeScene.scene, this.activeScene.camera, {
            focus: 10.0,
            aperture: 0.001,
            maxblur: 0
        });
        this.composer.addPass(this.activeScene.bokehPass);


        // SMAA
        const smaaPass = new this.SMAAPass(this.width * this.dpr, this.height * this.dpr);
        this.composer.addPass(smaaPass);


        // Final
        const outputPass = new this.OutputPass();
        this.composer.addPass(outputPass);

        if (this.gui) {
            const posteffectFolder = this.gui.addFolder('PostEffects');
            posteffectFolder.close();

            posteffectFolder.add(this, 'postProcessEnabled').name('Post-Process Enabled');

            const bloomFolder = posteffectFolder.addFolder('Bloom');
            bloomFolder.add(bloomPass, 'strength', 0, 3);
            bloomFolder.add(bloomPass, 'radius', 0, 1);
            bloomFolder.add(bloomPass, 'threshold', 0, 1);
            bloomFolder.close();

            const gtaoFolder = posteffectFolder.addFolder('GTAO Shadows');
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