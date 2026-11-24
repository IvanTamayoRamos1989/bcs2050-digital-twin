# BCS2050 — State-of-the-Art Regional & Urban Digital Twin

Benchmarked against **Aretian's Barcelona Metropolitan Region City Digital Twin** and **Esri's Living Digital Twin** framework, integrating real Baja California Sur spatial assets (`396,823` 3D buildings across 9 cities, `79,515` land-use zoning polygons, `1,155` INEGI/CONEVAL AGEBs, `3,510` essential services, `40` CONAGUA aquifers, `280` La Paz tandeo sectors, `102` SIBCS transmission lines, `34` substations, `14` power plants, `1,990` POER UGAs, `76` CONANP ANPs, `115` transit stops) with the `bcs2050_intelligence` Ontology v3.0 engine.

## Quick Start (Local Development & Executive Demo)

### 1. Build the Spatial & City Science Datastore (already pre-run or re-run anytime)
```powershell
python bcs2050_digital_twin/backend/pipeline/build_city_science_datastore.py
```

### 2. Build Frontend Production Assets (if modified)
```powershell
cd bcs2050_digital_twin/frontend
npm install
npm run build
```

### 3. Launch the Full-Stack Digital Twin
```powershell
.\bcs2050_digital_twin\run_local.ps1
```
Then open **`http://127.0.0.1:8050`** in your browser.

### 4. Plug In Commercial 3D / Enterprise Licenses (Optional)
Edit `bcs2050_digital_twin/frontend/.env.local` (from `.env.example`) and add any commercial keys (`VITE_GOOGLE_MAPS_API_KEY`, `VITE_CESIUM_ION_TOKEN`, `VITE_MAPTILER_KEY`, `VITE_ARCGIS_API_KEY`), rebuild `frontend/`, and the CesiumJS 3D Globe automatically upgrades to **Google Photorealistic 3D Tiles + Cesium World Terrain**.

### 5. Run Automated Verification Tests
```powershell
pytest bcs2050_digital_twin/backend/tests/test_twin_api.py -v
```

See [MASTER_DIGITAL_TWIN_ARCHITECTURE.md](./MASTER_DIGITAL_TWIN_ARCHITECTURE.md) for the complete forensic audit, commercial procurement tiers, and integration blueprint for the 126 open-source tools.
