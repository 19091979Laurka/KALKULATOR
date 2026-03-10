"""
3D Model Generator - generowanie modelu 3D działki + infrastruktury
Używa: three.js + mapbox terrain
"""
import json
from pathlib import Path
from typing import List, Dict
import math

class Model3DGenerator:
    def __init__(self, output_path: Path = Path("output/model_3d.html")):
        self.output_path = output_path

    def generate_3d_map(self, parcels: List[Dict], infrastructure: List[Dict]):
        """Generuje interaktywny model 3D z Three.js"""

        html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Model 3D - Działki + Infrastruktura</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@r128/examples/js/controls/OrbitControls.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@r128/examples/js/loaders/GLTFLoader.js"></script>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            font-family: Arial, sans-serif;
            background: #1a1a1a;
        }
        #canvas {
            display: block;
            width: 100%;
            height: 100vh;
        }
        #info {
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 20px;
            border-radius: 8px;
            max-width: 400px;
            font-size: 12px;
            z-index: 10;
        }
        #info h2 {
            margin-top: 0;
            color: #4da6ff;
        }
        #info h3 {
            color: #ffcc00;
            margin-top: 15px;
        }
        #info p {
            margin: 5px 0;
            line-height: 1.4;
        }
        .stat {
            background: rgba(77, 166, 255, 0.1);
            padding: 8px;
            margin: 5px 0;
            border-left: 3px solid #4da6ff;
        }
        #controls {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            font-size: 12px;
        }
        .legend {
            position: absolute;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 15px;
            border-radius: 8px;
            font-size: 12px;
        }
        .legend-item {
            margin: 5px 0;
            display: flex;
            align-items: center;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            margin-right: 10px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div id="info">
        <h2>📊 Model 3D - Działki + Infrastruktura</h2>
        <div id="parcel-info"></div>
    </div>

    <div id="controls">
        🖱️ Obrót: LPM + drag | 🔍 Zoom: scroll | 🔄 Reset: klik środkowy
    </div>

    <div class="legend">
        <h3>Legenda</h3>
        <div class="legend-item">
            <div class="legend-color" style="background: #3388ff;"></div>
            <span>Działka</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #ff6b6b;"></div>
            <span>Linia energetyczna</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #ffa500;"></div>
            <span>Gazociąg</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #4ecdc4;"></div>
            <span>Wodociąg</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #95e1d3;"></div>
            <span>Kanalizacja</span>
        </div>
    </div>

    <script>
        // Dane działek i infrastruktury
        const parcelsData = """ + json.dumps(parcels) + """;
        const infrastructureData = """ + json.dumps(infrastructure) + """;

        // Three.js setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        scene.fog = new THREE.Fog(0x1a1a2e, 1000, 2000);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.set(0, 150, 200);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowShadowMap;
        document.body.appendChild(renderer.domElement);

        // Oświetlenie
        const light = new THREE.DirectionalLight(0xffffff, 0.8);
        light.position.set(100, 150, 100);
        light.castShadow = true;
        light.shadow.mapSize.width = 2048;
        light.shadow.mapSize.height = 2048;
        light.shadow.camera.left = -500;
        light.shadow.camera.right = 500;
        light.shadow.camera.top = 500;
        light.shadow.camera.bottom = -500;
        scene.add(light);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        // Grid (podłoże)
        const gridHelper = new THREE.GridHelper(500, 20, 0x444444, 0x222222);
        gridHelper.position.y = -1;
        scene.add(gridHelper);

        // Funkcja konwersji lat/lon na 3D
        function latLonTo3D(lat, lon, scale = 0.001) {
            const centerLat = parcelsData[0].geometry.center[1];
            const centerLon = parcelsData[0].geometry.center[0];

            const x = (lon - centerLon) / scale;
            const z = (lat - centerLat) / scale;
            return { x, z };
        }

        // Renderuj działki
        parcelsData.forEach((parcel, idx) => {
            const coords = parcel.geometry.coordinates[0];
            const points = [];

            coords.forEach(coord => {
                const pos = latLonTo3D(coord[1], coord[0]);
                points.push(new THREE.Vector2(pos.x, pos.z));
            });

            const shape = new THREE.Shape(points);
            const geometry = new THREE.ShapeGeometry(shape);
            const material = new THREE.MeshStandardMaterial({
                color: 0x3388ff,
                emissive: 0x1a5fa6,
                metalness: 0.3,
                roughness: 0.6
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = idx * 0.5;
            mesh.receiveShadow = true;
            mesh.castShadow = true;

            // Outline
            const edges = new THREE.EdgesGeometry(geometry);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x0055ff, linewidth: 3 }));
            line.position.y = idx * 0.5;
            mesh.add(line);

            scene.add(mesh);

            // Label
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.font = '30px Arial';
            ctx.fillText(parcel.parcel_id, 10, 30);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(50, 25, 1);

            const center = parcel.geometry.center;
            const pos = latLonTo3D(center[1], center[0]);
            sprite.position.set(pos.x, 20, pos.z);
            scene.add(sprite);
        });

        // Renderuj infrastrukturę (3D linie)
        const colorMap = {
            'E': 0xff6b6b,    // Energetyka - czerwony
            'G': 0xffa500,    // Gaz - pomarańczowy
            'W': 0x4ecdc4,    // Woda - turkusowy
            'K': 0x95e1d3,    // Kanalizacja - miętowy
            'T': 0x9d84b7     // Telekom - fioletowy
        };

        infrastructureData.forEach(infra => {
            const coords = infra.geometry.coordinates;
            const points = [];

            coords.forEach(coord => {
                const pos = latLonTo3D(coord[1], coord[0]);
                points.push(new THREE.Vector3(pos.x, 10, pos.z));
            });

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const color = colorMap[infra.type[0]] || 0xffffff;
            const material = new THREE.LineBasicMaterial({ color: color, linewidth: 5 });
            const line = new THREE.Line(geometry, material);
            scene.add(line);

            // Słupy na linii (wizualizacja)
            for (let i = 0; i < points.length; i += 3) {
                const poleGeometry = new THREE.CylinderGeometry(0.5, 0.5, 25, 8);
                const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
                const pole = new THREE.Mesh(poleGeometry, poleMaterial);
                pole.position.copy(points[i]);
                pole.castShadow = true;
                scene.add(pole);
            }
        });

        // Kontrola kamery
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 2;

        // Info panel
        function updateInfo() {
            const parcelInfo = document.getElementById('parcel-info');
            let html = '';

            parcelsData.forEach(p => {
                html += `<h3>${p.parcel_id}</h3>`;
                html += `<div class="stat">`;
                html += `<p>📐 Powierzchnia: ${p.area_m2.toFixed(0)} m²</p>`;
                html += `<p>💰 Wartość: ${(p.value_per_m2 * p.area_m2).toLocaleString()} PLN</p>`;
                html += `</div>`;
            });

            // Infrastruktura
            const infraCount = infrastructureData.length;
            html += `<h3>⚡ Infrastruktura</h3>`;
            html += `<div class="stat">`;
            html += `<p>Liczba obiektów: ${infraCount}</p>`;
            const totalLength = infrastructureData.reduce((sum, i) => sum + i.length_m, 0);
            html += `<p>Całkowita długość: ${totalLength.toFixed(0)} m</p>`;
            html += `</div>`;

            parcelInfo.innerHTML = html;
        }

        updateInfo();

        // Resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Render loop
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }

        animate();
    </script>
</body>
</html>
"""

        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self.output_path.write_text(html)
        print(f"✓ Model 3D zapisany: {self.output_path}")
