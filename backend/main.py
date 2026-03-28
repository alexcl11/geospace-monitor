from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
# Test de despliegue automático con GitHub Actions 🤖
# 1. Inicializamos la aplicación
app = FastAPI(
    title="GeoSpace Monitor API",
    description="API que procesa telemetría de eventos naturales de la NASA"
)

# 2. Configuración CORS (Permite que cualquier frontend se conecte a esta API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NASA_EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"

# 3. Endpoint de salud (Muy útil para que Docker sepa si el contenedor está vivo)
@app.get("/")
def read_root():
    return {"status": "online", "mission": "GeoSpace Monitor", "systems": "nominal"}

# 4. El endpoint principal que procesa los datos espaciales
@app.get("/api/events")
async def get_events(limit: int = 500, days: int = 7):
    # Usamos httpx.AsyncClient para no bloquear el servidor mientras la NASA responde
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{NASA_EONET_URL}?limit={limit}&status=open&days={days}")
            response.raise_for_status()
            data = response.json()

            # 5. Limpiamos y transformamos los datos para facilitarle la vida al Frontend
            clean_events = []
            for event in data.get("events", []):
                if event.get("geometry"):
                    # Cogemos siempre la última coordenada registrada por el satélite
                    latest_geo = event["geometry"][-1] 
                    clean_events.append({
                        "id": event["id"],
                        "title": event["title"],
                        "category": event["categories"][0]["title"] if event.get("categories") else "Unknown",
                        "date": latest_geo["date"],
                        "coordinates": {
                            "lat": latest_geo["coordinates"][1],
                            "lon": latest_geo["coordinates"][0]
                        },
                        "Hola": hola
                        "magnitudeValue": latest_geo.get("magnitudeValue"),
                        "magnitudeUnit": latest_geo.get("magnitudeUnit")
                    })
            return {"total": len(clean_events), "events": clean_events}
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error conectando con la NASA: {str(e)}")