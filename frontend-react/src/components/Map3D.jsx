import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Map3D - Interaktywna 3D wizualizacja działek i infrastruktury
 * Obsługuje: tereny, działki, linie energetyczne, słupy, warstwy gaz/woda/teleko
 *
 * Props:
 * - parcels: Array of parcel objects with geometry and infrastructure data
 * - infrastructureTypes: Array of infrastructure types to display ('elektro', 'gaz', 'woda', 'teleko')
 * - center: [lon, lat] - center of map
 * - zoom: initial zoom level
 */

const Map3D = ({
  parcels = [],
  infrastructureTypes = ['elektro', 'gaz', 'woda', 'teleko'],
  center = [20.156, 52.685],
  zoom = 1,
  onParcelClick = null,
  selectedParcelId = null
}) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);

  // Kolory dla infrastruktury - profesjonalne napięcia elektryczne
  const INFRASTRUCTURE_COLORS = {
    "380kV": 0xff0000,     // Czerwony - główne linie
    "220kV": 0xff6600,     // Pomarańczowy - linie międzynarodowe
    "110kV": 0xffcc00,     // Żółty - linie przesyłowe
    "30kV": 0x00cc00,      // Zielony - SN
    "15kV": 0x00cc00,      // Zielony - SN
    "nN": 0x0066ff,        // Niebieski - nN
    elektro: 0xffcc00,     // Domyślny kolor elektryki (110kV)
    gaz: 0xf39c12,         // Pomarańczowy
    woda: 0x3498db,        // Niebieski
    teleko: 0x9b59b6,      // Purpurowy
    granica: 0xa91079,     // Magenta - granice działki
    teren: 0x27ae60,       // Zielony
    slup: 0x8B4513         // Brązowy - słupy
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // === THREE.JS SETUP ===
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb0d0ff);
    scene.fog = new THREE.Fog(0xb0d0ff, 500, 1500);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
    camera.position.set(center[0] * 100, 80 * zoom, center[1] * 100 + 50);
    camera.lookAt(center[0] * 100, 0, center[1] * 100);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // === LIGHTING ===
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(200, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.far = 1000;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    scene.add(directionalLight);

    // === GROUND/TERRAIN ===
    // Podłoże (z teksturą)
    const groundGeometry = new THREE.PlaneGeometry(800, 800);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -5;
    scene.add(ground);

    // Trawa
    const grassGeometry = new THREE.PlaneGeometry(750, 750);
    const grassMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.position.y = 0.1;
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);

    // === DZIAŁKI (PARCELS) ===
    const parcelMeshes = {};

    parcels.forEach((parcel) => {
      if (!parcel.geometry || !parcel.geometry.coordinates) return;

      // Konwertuj współrzędne geograficzne na scene coordinates
      const coordinates = parcel.geometry.coordinates[0];
      const points = coordinates.map(coord => {
        return new THREE.Vector3(
          (coord[0] - center[0]) * 100000 * 0.01,
          0.5,
          (coord[1] - center[1]) * 100000 * 0.01
        );
      });

      // Twórz outline działki (granica)
      const outlineGeometry = new THREE.BufferGeometry();
      outlineGeometry.setFromPoints(points);
      const outlineColor = selectedParcelId === parcel.parcel_id ? 0x3498db : INFRASTRUCTURE_COLORS.granica;
      const outlineMaterial = new THREE.LineBasicMaterial({
        color: outlineColor,
        linewidth: 3,
        fog: true
      });
      const outline = new THREE.Line(outlineGeometry, outlineMaterial);
      outline.name = `parcel_${parcel.parcel_id}`;
      outline.userData.parcelId = parcel.parcel_id;
      scene.add(outline);

      // Twórz powierzchnię działki (dla clickowania)
      if (points.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, points[0].z);
        for (let i = 1; i < points.length; i++) {
          shape.lineTo(points[i].x, points[i].z);
        }

        const geometry = new THREE.ShapeGeometry(shape);
        const fillColor = selectedParcelId === parcel.parcel_id ? 0xaed6f1 : 0xd5f4e6;
        const material = new THREE.MeshStandardMaterial({
          color: fillColor,
          emissive: selectedParcelId === parcel.parcel_id ? 0x3498db : 0x000000,
          emissiveIntensity: selectedParcelId === parcel.parcel_id ? 0.3 : 0,
          wireframe: false,
          fog: true
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.2;
        mesh.name = `parcel_fill_${parcel.parcel_id}`;
        mesh.userData.parcelId = parcel.parcel_id;
        mesh.userData.parcel = parcel;
        parcelMeshes[parcel.parcel_id] = mesh;
        scene.add(mesh);
      }

      // Label działki
      if (parcel.geometry.centroid_ll) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(parcel.parcel_id, 256, 100);
        ctx.font = '20px Arial';
        ctx.fillText(`${(parcel.geometry.area_m2 / 1000).toFixed(1)}k m²`, 256, 150);

        const texture = new THREE.CanvasTexture(canvas);
        const labelGeometry = new THREE.PlaneGeometry(50, 25);
        const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.set(
          (parcel.geometry.centroid_ll[0] - center[0]) * 100000 * 0.01,
          25,
          (parcel.geometry.centroid_ll[1] - center[1]) * 100000 * 0.01
        );
        label.rotation.y = Math.PI;
        scene.add(label);
      }
    });

    // === INFRASTRUKTURA ===
    parcels.forEach((parcel) => {
      if (!parcel.infrastructure) return;

      const polePositions = [];

      // ELEKTRO (POWER LINES)
      if (infrastructureTypes.includes('elektro') && (parcel.infrastructure.power_lines?.detected || parcel.infrastructure.power?.exists || true)) {
        const color = INFRASTRUCTURE_COLORS.elektro;
        const centerX = (parcel.geometry.centroid_ll[0] - center[0]) * 100000 * 0.01;
        const centerZ = (parcel.geometry.centroid_ll[1] - center[1]) * 100000 * 0.01;

        // Linia
        const lineGeometry = new THREE.BufferGeometry();
        const linePoints = [
          new THREE.Vector3(centerX - 20, 15, centerZ - 10),
          new THREE.Vector3(centerX + 20, 15, centerZ + 10)
        ];
        lineGeometry.setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 4 });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);

        // Słupy
        polePositions.push(
          [centerX - 20, 15, centerZ - 10],
          [centerX, 15, centerZ],
          [centerX + 20, 15, centerZ + 10]
        );
      }

      // GAZ
      if (infrastructureTypes.includes('gaz') && parcel.infrastructure.other_media?.gaz?.detected) {
        const color = INFRASTRUCTURE_COLORS.gaz;
        const centerX = (parcel.geometry.centroid_ll[0] - center[0]) * 100000 * 0.01;
        const centerZ = (parcel.geometry.centroid_ll[1] - center[1]) * 100000 * 0.01;

        const lineGeometry = new THREE.BufferGeometry();
        const linePoints = [
          new THREE.Vector3(centerX - 25, 8, centerZ - 15),
          new THREE.Vector3(centerX + 25, 8, centerZ + 5)
        ];
        lineGeometry.setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 3 });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);
      }

      // WODA
      if (infrastructureTypes.includes('woda') && (parcel.infrastructure.other_media?.woda?.detected || parcel.infrastructure.other_media?.kanal?.detected)) {
        const color = INFRASTRUCTURE_COLORS.woda;
        const centerX = (parcel.geometry.centroid_ll[0] - center[0]) * 100000 * 0.01;
        const centerZ = (parcel.geometry.centroid_ll[1] - center[1]) * 100000 * 0.01;

        const lineGeometry = new THREE.BufferGeometry();
        const linePoints = [
          new THREE.Vector3(centerX - 30, 5, centerZ - 5),
          new THREE.Vector3(centerX + 30, 5, centerZ + 5)
        ];
        lineGeometry.setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 3 });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);
      }

      // TELEKOMUNIKACJA
      if (infrastructureTypes.includes('teleko') && parcel.infrastructure.telecom?.fiber_ready) {
        const color = INFRASTRUCTURE_COLORS.teleko;
        const centerX = (parcel.geometry.centroid_ll[0] - center[0]) * 100000 * 0.01;
        const centerZ = (parcel.geometry.centroid_ll[1] - center[1]) * 100000 * 0.01;

        const lineGeometry = new THREE.BufferGeometry();
        const linePoints = [
          new THREE.Vector3(centerX - 20, 12, centerZ - 20),
          new THREE.Vector3(centerX + 20, 12, centerZ + 20)
        ];
        lineGeometry.setFromPoints(linePoints);
        const lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 2 });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);
      }

      // Render słupy
      polePositions.forEach(pos => {
        const poleGeometry = new THREE.CylinderGeometry(0.5, 0.8, 25, 12);
        const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.set(pos[0], pos[1] - 5, pos[2]);
        pole.castShadow = true;
        pole.receiveShadow = true;
        scene.add(pole);

        // Insulator
        const insulatorGeometry = new THREE.SphereGeometry(0.4, 16, 16);
        const insulatorMaterial = new THREE.MeshStandardMaterial({
          color: INFRASTRUCTURE_COLORS.elektro,
          metalness: 0.6,
          roughness: 0.4
        });
        const insulator = new THREE.Mesh(insulatorGeometry, insulatorMaterial);
        insulator.position.set(pos[0], pos[1] + 8, pos[2]);
        insulator.castShadow = true;
        scene.add(insulator);
      });
    });

    // === CONTROLS ===
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 50;
    controls.maxDistance = 1000;
    controlsRef.current = controls;

    // === RAYCASTER FOR CLICKING ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseClick = (event) => {
      const canvas = renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(scene.children);
      for (let i = 0; i < intersects.length; i++) {
        if (intersects[i].object.userData.parcelId) {
          if (onParcelClick) {
            onParcelClick(intersects[i].object.userData.parcelId, intersects[i].object.userData.parcel);
          }
          break;
        }
      }
    };

    renderer.domElement.addEventListener('click', onMouseClick, false);

    // === ANIMATION LOOP ===
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // === HANDLE RESIZE ===
    const handleResize = () => {
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onMouseClick);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [parcels, infrastructureTypes, center, zoom, selectedParcelId, onParcelClick]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#f5f7fa'
      }}
    />
  );
};

export default Map3D;
