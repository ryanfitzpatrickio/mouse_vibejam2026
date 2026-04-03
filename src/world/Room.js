import * as THREE from 'three/webgpu';
import { createKeyCelMaterial, createToonFallbackMaterial } from '../materials/index.js';

/**
 * AABB (Axis-Aligned Bounding Box) for collision detection
 */
class AABB {
  constructor(min = new THREE.Vector3(), max = new THREE.Vector3()) {
    this.min = min;
    this.max = max;
  }

  static fromMesh(mesh) {
    const box = new THREE.Box3();
    box.setFromObject(mesh);
    return new AABB(box.min.clone(), box.max.clone());
  }

  intersects(other) {
    return (
      this.min.x <= other.max.x &&
      this.max.x >= other.min.x &&
      this.min.y <= other.max.y &&
      this.max.y >= other.min.y &&
      this.min.z <= other.max.z &&
      this.max.z >= other.min.z
    );
  }
}

/**
 * Room class: constructs a kitchen room with furniture, collision, and loot
 */
export class Room {
  constructor(options = {}) {
    this.group = new THREE.Group();
    this.group.name = 'Kitchen';

    this.colliders = []; // Array of { mesh, aabb, type }
    this.lootItems = []; // Array of loot meshes
    this.climbables = []; // Surfaces player can climb
    this.runnables = []; // Surfaces player can run on

    // Room dimensions
    this.width = options.width ?? 8;
    this.depth = options.depth ?? 8;
    this.height = options.height ?? 4;

    // Materials
    this.floorColor = options.floorColor ?? '#d4a574'; // Wood
    this.wallColor = options.wallColor ?? '#e8dcc8'; // Plaster
    this.furnitureColor = options.furnitureColor ?? '#8b6f47'; // Wood furniture

    this.buildRoom();
  }

  buildRoom() {
    this.buildFloorAndWalls();
    this.buildFurniture();
    this.buildLoot();
  }

  buildFloorAndWalls() {
    const floorMat = createKeyCelMaterial({ baseColor: this.floorColor });
    const wallMat = createKeyCelMaterial({ baseColor: this.wallColor });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = 0;
    floor.name = 'Floor';
    this.group.add(floor);
    this.colliders.push({
      mesh: floor,
      aabb: AABB.fromMesh(floor),
      type: 'surface',
      metadata: { runnable: true }, // Can run on floor
    });
    this.runnables.push(floor);

    // Walls: back, front, left, right
    const wallThickness = 0.2;

    // Back wall
    const backWallGeo = new THREE.BoxGeometry(this.width, this.height, wallThickness);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, this.height * 0.5, -this.depth * 0.5);
    backWall.name = 'BackWall';
    this.group.add(backWall);
    this.colliders.push({
      mesh: backWall,
      aabb: AABB.fromMesh(backWall),
      type: 'wall',
    });

    // Front wall
    const frontWall = new THREE.Mesh(backWallGeo, wallMat);
    frontWall.position.set(0, this.height * 0.5, this.depth * 0.5);
    frontWall.name = 'FrontWall';
    this.group.add(frontWall);
    this.colliders.push({
      mesh: frontWall,
      aabb: AABB.fromMesh(frontWall),
      type: 'wall',
    });

    // Left wall
    const sideWallGeo = new THREE.BoxGeometry(wallThickness, this.height, this.depth);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-this.width * 0.5, this.height * 0.5, 0);
    leftWall.name = 'LeftWall';
    this.group.add(leftWall);
    this.colliders.push({
      mesh: leftWall,
      aabb: AABB.fromMesh(leftWall),
      type: 'wall',
    });

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(this.width * 0.5, this.height * 0.5, 0);
    rightWall.name = 'RightWall';
    this.group.add(rightWall);
    this.colliders.push({
      mesh: rightWall,
      aabb: AABB.fromMesh(rightWall),
      type: 'wall',
    });

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const ceiling = new THREE.Mesh(ceilingGeo, wallMat);
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.y = this.height;
    ceiling.name = 'Ceiling';
    this.group.add(ceiling);
    this.colliders.push({
      mesh: ceiling,
      aabb: AABB.fromMesh(ceiling),
      type: 'surface',
    });
  }

  buildFurniture() {
    const furnitureMat = createKeyCelMaterial({ baseColor: this.furnitureColor });

    // TABLE: centered, with climbable legs
    const tableHeight = 1.0;
    const tableWidth = 2.0;
    const tableDepth = 1.2;
    const legThickness = 0.15;

    // Table top
    const tableTopGeo = new THREE.BoxGeometry(tableWidth, 0.1, tableDepth);
    const tableTop = new THREE.Mesh(tableTopGeo, furnitureMat);
    tableTop.position.set(-2, tableHeight, 0);
    tableTop.name = 'TableTop';
    this.group.add(tableTop);
    this.colliders.push({
      mesh: tableTop,
      aabb: AABB.fromMesh(tableTop),
      type: 'surface',
      metadata: { runnable: true }, // Can stand on table
    });
    this.runnables.push(tableTop);

    // Table legs (climbable)
    const legOffsets = [
      { x: -tableWidth * 0.4, z: -tableDepth * 0.4 },
      { x: tableWidth * 0.4, z: -tableDepth * 0.4 },
      { x: -tableWidth * 0.4, z: tableDepth * 0.4 },
      { x: tableWidth * 0.4, z: tableDepth * 0.4 },
    ];

    legOffsets.forEach((offset, i) => {
      const legGeo = new THREE.BoxGeometry(legThickness, tableHeight, legThickness);
      const leg = new THREE.Mesh(legGeo, furnitureMat);
      leg.position.set(-2 + offset.x, tableHeight * 0.5, offset.z);
      leg.name = `TableLeg${i}`;
      this.group.add(leg);
      this.colliders.push({
        mesh: leg,
        aabb: AABB.fromMesh(leg),
        type: 'climbable',
      });
      this.climbables.push(leg);
    });

    // COUNTERTOP: along back wall, elevated, runnable
    const counterHeight = 0.95;
    const counterWidth = 3.5;
    const counterDepth = 0.6;

    const counterGeo = new THREE.BoxGeometry(counterWidth, 0.15, counterDepth);
    const counter = new THREE.Mesh(counterGeo, furnitureMat);
    counter.position.set(0, counterHeight, -this.depth * 0.35);
    counter.name = 'Countertop';
    this.group.add(counter);
    this.colliders.push({
      mesh: counter,
      aabb: AABB.fromMesh(counter),
      type: 'surface',
      metadata: { runnable: true },
    });
    this.runnables.push(counter);

    // Counter support legs
    const counterLegOffsets = [
      { x: -counterWidth * 0.4 },
      { x: counterWidth * 0.4 },
    ];

    counterLegOffsets.forEach((offset, i) => {
      const legGeo = new THREE.BoxGeometry(0.15, counterHeight * 0.95, 0.15);
      const leg = new THREE.Mesh(legGeo, furnitureMat);
      leg.position.set(offset.x, counterHeight * 0.475, -this.depth * 0.35);
      leg.name = `CounterLeg${i}`;
      this.group.add(leg);
      this.colliders.push({
        mesh: leg,
        aabb: AABB.fromMesh(leg),
        type: 'wall',
      });
    });

    // CABINET: beside counter, with opening door animation potential
    const cabinetWidth = 0.8;
    const cabinetHeight = 0.8;
    const cabinetDepth = 0.5;

    const cabinetGeo = new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth);
    const cabinet = new THREE.Mesh(cabinetGeo, furnitureMat);
    cabinet.position.set(2.2, cabinetHeight * 0.5, -this.depth * 0.35);
    cabinet.name = 'Cabinet';
    this.group.add(cabinet);
    this.colliders.push({
      mesh: cabinet,
      aabb: AABB.fromMesh(cabinet),
      type: 'furniture',
    });

    // CHAIR: near table, stackable for vertical navigation
    const chairSeatHeight = 0.5;
    const chairSeatGeo = new THREE.BoxGeometry(0.5, 0.1, 0.5);
    const chairSeat = new THREE.Mesh(chairSeatGeo, furnitureMat);
    chairSeat.position.set(-1, chairSeatHeight, 1.5);
    chairSeat.name = 'ChairSeat';
    this.group.add(chairSeat);
    this.colliders.push({
      mesh: chairSeat,
      aabb: AABB.fromMesh(chairSeat),
      type: 'surface',
      metadata: { runnable: true },
    });
    this.runnables.push(chairSeat);

    // Chair back
    const chairBackGeo = new THREE.BoxGeometry(0.5, 0.8, 0.1);
    const chairBack = new THREE.Mesh(chairBackGeo, furnitureMat);
    chairBack.position.set(-1, chairSeatHeight + 0.4, 1.5 - 0.3);
    chairBack.name = 'ChairBack';
    this.group.add(chairBack);
    this.colliders.push({
      mesh: chairBack,
      aabb: AABB.fromMesh(chairBack),
      type: 'wall',
    });

    // Chair legs
    const chairLegOffsets = [
      { x: -0.2, z: -0.2 },
      { x: 0.2, z: -0.2 },
      { x: -0.2, z: 0.2 },
      { x: 0.2, z: 0.2 },
    ];

    chairLegOffsets.forEach((offset, i) => {
      const legGeo = new THREE.BoxGeometry(0.08, chairSeatHeight, 0.08);
      const leg = new THREE.Mesh(legGeo, furnitureMat);
      leg.position.set(-1 + offset.x, chairSeatHeight * 0.5, 1.5 + offset.z);
      leg.name = `ChairLeg${i}`;
      this.group.add(leg);
      this.colliders.push({
        mesh: leg,
        aabb: AABB.fromMesh(leg),
        type: 'wall',
      });
    });
  }

  buildLoot() {
    // Cheese wedge: glowing loot item on countertop
    const cheeseGeo = new THREE.TetrahedronGeometry(0.25, 0);
    const cheeseMat = new THREE.MeshStandardMaterial({
      color: '#ffdd66',
      emissive: '#ffcc00',
      emissiveIntensity: 0.8,
      roughness: 0.6,
      metalness: 0.0,
    });

    const cheese = new THREE.Mesh(cheeseGeo, cheeseMat);
    cheese.position.set(0.5, 0.95 + 0.3, -this.depth * 0.35); // On top of counter
    cheese.name = 'CheeseLoot';
    cheese.castShadow = true;
    cheese.receiveShadow = true;
    this.group.add(cheese);

    this.lootItems.push(cheese);
    this.colliders.push({
      mesh: cheese,
      aabb: AABB.fromMesh(cheese),
      type: 'loot',
      metadata: { itemId: 'cheese', carried: false },
    });

    // Particle sparkle effect (simple glow around cheese)
    const sparkleGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: '#ffdd88',
      transparent: true,
      opacity: 0.3,
      wireframe: true,
    });
    const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
    sparkle.position.copy(cheese.position);
    sparkle.name = 'CheeseSparkle';
    this.group.add(sparkle);

    // Store sparkle for animation
    cheese.userData.sparkle = sparkle;
  }

  /**
   * Check collision between a player AABB and room colliders
   */
  checkCollision(playerAABB) {
    return this.colliders.filter((col) => playerAABB.intersects(col.aabb));
  }

  /**
   * Get all climbable surfaces
   */
  getClimbables() {
    return this.climbables;
  }

  /**
   * Get all runnable surfaces
   */
  getRunnables() {
    return this.runnables;
  }

  /**
   * Animate loot items (bobbing, rotation)
   */
  updateLoot(timeMs) {
    const t = timeMs * 0.001;

    this.lootItems.forEach((item) => {
      // Gentle bobbing
      item.position.y += Math.sin(t * 2) * 0.001;

      // Slow rotation
      item.rotation.x += 0.005;
      item.rotation.y += 0.008;

      // Sparkle animation
      if (item.userData.sparkle) {
        const scale = 1 + Math.sin(t * 3) * 0.15;
        item.userData.sparkle.scale.set(scale, scale, scale);
      }
    });
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  /**
   * Get the THREE.Group for adding to scene
   */
  getGroup() {
    return this.group;
  }
}
