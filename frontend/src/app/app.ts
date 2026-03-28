import { Component, OnInit, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- VITAL para poder usar el *ngFor en los botones
import { HttpClient } from '@angular/common/http';
import { finalize, timeout } from 'rxjs';
import * as L from 'leaflet';
import { environment } from '../environments/environment';
import { HttpHeaders } from '@angular/common/http';
import 'leaflet.heat';

// Añadimos esta interfaz para que TS no se queje de L.heatLayer
declare module 'leaflet' {
  function heatLayer(latlngs: L.LatLngExpression[], options?: any): L.Layer;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule], // <-- Lo añadimos aquí
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit, AfterViewInit {
  private map: any;
  private markerLayerGroup = L.layerGroup(); // Grupo para poder borrar y repintar puntos
  private heatLayers: L.Layer[] = [];
  private apiUrl = environment.apiUrl;
  private loadingFailSafeTimer: ReturnType<typeof setTimeout> | null = null;
  private mobileBreakpoint = 900;


  isLoading: boolean = true;
  isSidebarOpen: boolean = false;

  // Variables para la interfaz
  allEvents: any[] = [];
  filteredEvents: any[] = [];
  categories: string[] = ['All'];
  selectedCategory: string = 'All';
  showMarkers: boolean = true;
  showHeatmap: boolean = true;
  heatRadius: number = 25;
  heatBlur: number = 15;
  categoryStats: Array<{ name: string; count: number }> = [];
  timeRangeText: string = 'No data';
  lastSyncText: string = '--';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.initMap();
    this.fetchNASAEvents();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.refreshMapSize();
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
    this.refreshMapSize();
  }

  isMobileView(): boolean {
    return window.innerWidth <= this.mobileBreakpoint;
  }

  private initMap(): void {
    // 1. Configuración física del mapa
    this.map = L.map('map', { 
      zoomControl: false,
      minZoom: 2, // Evita que el usuario aleje tanto que la Tierra se vuelva un punto
      maxZoom: 18,
      maxBounds: [[-90, -180], [90, 180]], // Límites físicos del planeta
      maxBoundsViscosity: 1.0, // Hace que los bordes sean sólidos (no rebotan)
      worldCopyJump: false // Desactiva el salto al cruzar el Océano Pacífico
    });
    
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // 2. Configuración gráfica (AQUÍ ESTÁ EL TRUCO: noWrap y bounds)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors, © CARTO',
      noWrap: true, // <--- ESTO EVITA QUE EL MAPA SE REPITA A LOS LADOS
      bounds: [[-90, -180], [90, 180]] // <--- Evita que intente cargar imágenes fuera de los polos
    }).addTo(this.map);

    this.markerLayerGroup.addTo(this.map);

    // 3. Ajuste automático a la pantalla
    // En lugar de un setView fijo, le decimos que encuadre todo el planeta
    this.map.fitBounds([
      [-60, -180], // Esquina inferior izquierda (Cortamos un poco la Antártida para centrar mejor)
      [80, 180]    // Esquina superior derecha
    ]);
  }

  private fetchNASAEvents(): void {
    this.isLoading = true; // Encendemos el loading por si acaso
    this.startLoadingFailSafe();

    const headers = new HttpHeaders({
      'ngrok-skip-browser-warning': 'true'
    });

    this.http.get<any>(this.apiUrl, { headers: headers }).pipe(
      timeout(50000),
      finalize(() => {
        // Pase lo que pase (éxito, error o timeout), apagamos el loading.
        this.isLoading = false;
        this.clearLoadingFailSafe();
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (data) => {
        this.allEvents = Array.isArray(data?.events) ? data.events : [];
        this.filteredEvents = this.allEvents;

        // Magia de JS: Extraemos las categorías únicas de los datos de la NASA
        const cats = new Set(this.allEvents.map(e => e.category));
        this.categories = ['All', ...Array.from(cats)];

        this.lastSyncText = new Date().toLocaleString();
        this.updateDerivedStats();
        this.drawMarkers();
      },
      error: (err) => {
        console.error('Error de conexión:', err,);
      }
    });
  }

  private startLoadingFailSafe(): void {
    this.clearLoadingFailSafe();

    // Evita que el overlay quede infinito por cualquier estado no esperado.
    this.loadingFailSafeTimer = setTimeout(() => {
      this.isLoading = false;
      this.cdr.detectChanges();
    }, 12000);
  }

  private clearLoadingFailSafe(): void {
    if (this.loadingFailSafeTimer) {
      clearTimeout(this.loadingFailSafeTimer);
      this.loadingFailSafeTimer = null;
    }
  }

  // Función que se ejecuta al hacer clic en un botón del menú
  filterByCategory(category: string): void {
    this.selectedCategory = category;
    if (category === 'All') {
      this.filteredEvents = this.allEvents;
    } else {
      this.filteredEvents = this.allEvents.filter(e => e.category === category);
    }
    this.updateDerivedStats();
    this.drawMarkers(); // Repintamos el mapa con los filtrados

    if (this.isMobileView()) {
      this.closeSidebar();
    }
  }

  private refreshMapSize(): void {
    if (!this.map) return;

    setTimeout(() => {
      this.map.invalidateSize();
    }, 320);
  }

  private drawMarkers(): void {
    this.markerLayerGroup.clearLayers(); // Borramos los puntos antiguos

    if (this.heatLayers.length > 0) {
      this.heatLayers.forEach((layer) => this.map.removeLayer(layer));
      this.heatLayers = [];
    }

    const heatPointsByType: Record<'wildfire' | 'storm' | 'iceberg' | 'other', Array<[number, number, number]>> = {
      wildfire: [],
      storm: [],
      iceberg: [],
      other: []
    };

    // Normalizamos por el mayor evento del lote visible para que el heatmap
    // no se vea "apagado" en producción con datasets pequeños.
    const maxVisibleAreaKm2 = Math.max(
      ...this.filteredEvents
        .map((event: any) => this.getAreaKm2(event))
        .filter((area: number) => Number.isFinite(area) && area > 0),
      1
    );

    this.filteredEvents.forEach((event: any) => {
      try {
        // 1. Blindaje: Nos aseguramos de que la categoría existe como texto
        const cat = event.category ? String(event.category) : 'Unknown';
        
        if (event.coordinates && event.coordinates.lat != null && event.coordinates.lon != null) {
          const lat = Number(event.coordinates.lat);
          const lon = Number(event.coordinates.lon);

          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return;
          }

        // 2. Asignamos color y tipo de heatmap según categoría
        const visual = this.getVisualStyle(cat);
        const markerColor = visual.markerColor;

          if (this.showMarkers) {
            // Calcular radio dinámico basado en magnitud
            const radius = this.calculateMarkerRadius(event);
            
            const marker = L.circleMarker([lat, lon], {
              radius: radius,
              fillColor: markerColor,
              color: markerColor,
              weight: 1,
              opacity: 1,
              fillOpacity: 0.8
            });

        // // 3. Blindaje: Comprobamos que las coordenadas existen antes de dibujar
        // if (event.coordinates && event.coordinates.lat && event.coordinates.lon) {
        //   const marker = L.circleMarker([event.coordinates.lat, event.coordinates.lon], {
        //     radius: 6,
        //     fillColor: markerColor,
        //     color: markerColor,
        //     weight: 1,
        //     opacity: 1,
        //     fillOpacity: 0.8
        //   });
          
            marker.bindPopup(`
              <strong style="color: ${markerColor};">${event.title}</strong><br>
              Category: ${cat}<br>
              Date: ${new Date(event.date).toLocaleDateString()}<br>
              Magnitude: ${this.getMagnitudeDisplay(event)}
            `);
            
            this.markerLayerGroup.addLayer(marker);
          }

          // Usar magnitud para intensidad del heatmap
          const heatIntensity = this.getHeatIntensity(event, maxVisibleAreaKm2);
          heatPointsByType[visual.heatKey].push([lat, lon, heatIntensity]);
        }
      } catch (error) {
        // Si un evento de la NASA viene rarísimo, lo ignoramos para que no rompa la web
        console.warn('Evento saltado por datos corruptos:', event.title);
      }
    });

    const heatLayerFactory = (L as any).heatLayer;
    if (this.showHeatmap && typeof heatLayerFactory === 'function') {
      this.addCategoryHeatLayer(heatPointsByType.wildfire, {
        0.2: '#ffb3a7',
        0.5: '#ff5a36',
        0.8: '#ff2a00',
        1.0: '#b30000'
      });

      this.addCategoryHeatLayer(heatPointsByType.storm, {
        0.2: '#9b8dff',
        0.5: '#6c7eff',
        0.8: '#3f55ff',
        1.0: '#5a00cc'
      });

      this.addCategoryHeatLayer(heatPointsByType.iceberg, {
        0.2: '#b8ecff',
        0.5: '#74d1ff',
        0.8: '#2ca8ff',
        1.0: '#0068e6'
      });

      this.addCategoryHeatLayer(heatPointsByType.other, {
        0.2: '#ffd49a',
        0.5: '#ffb347',
        0.8: '#ff8c00',
        1.0: '#cc6500'
      });
    } else if (this.showHeatmap && typeof heatLayerFactory !== 'function') {
      // Evita romper el mapa si el plugin no llegó a cargar.
      console.warn('leaflet.heat no está disponible; mostrando solo puntos exactos.');
    }

  }

  toggleMarkers(): void {
    this.showMarkers = !this.showMarkers;
    this.drawMarkers();
  }

  toggleHeatmap(): void {
    this.showHeatmap = !this.showHeatmap;
    this.drawMarkers();
  }

  setHeatRadius(value: number | string): void {
    const nextRadius = Number(value);
    if (!Number.isFinite(nextRadius)) {
      return;
    }

    this.heatRadius = Math.min(50, Math.max(10, nextRadius));
    if (this.showHeatmap) {
      this.drawMarkers();
    }
  }

  getCategoryColor(category: string): string {
    return this.getVisualStyle(category || 'Unknown').markerColor;
  }

  private addCategoryHeatLayer(points: Array<[number, number, number]>, gradient: Record<number, string>): void {
    if (!this.map || points.length === 0) {
      return;
    }

    const heatLayerFactory = (L as any).heatLayer;
    if (typeof heatLayerFactory !== 'function') {
      return;
    }

    const layer = heatLayerFactory(points, {
      radius: this.heatRadius,
      blur: this.heatBlur,
      maxZoom: 10,
      minOpacity: 0.25,
      max: 1.0,
      gradient
    }).addTo(this.map);

    this.heatLayers.push(layer);
  }

  private getVisualStyle(category: string): {
    markerColor: string;
    heatKey: 'wildfire' | 'storm' | 'iceberg' | 'other';
  } {
    const normalized = String(category || '').toLowerCase();

    if (normalized.includes('storm') || normalized.includes('cyclone') || normalized.includes('hurricane')) {
      return { markerColor: '#5f6eff', heatKey: 'storm' };
    }

    if (normalized.includes('iceberg') || normalized.includes('ice')) {
      return { markerColor: '#2ca8ff', heatKey: 'iceberg' };
    }

    if (normalized.includes('wildfire') || normalized.includes('fire')) {
      return { markerColor: '#ff2a00', heatKey: 'wildfire' };
    }

    return { markerColor: '#ff8c00', heatKey: 'other' };
  }

  private updateDerivedStats(): void {
    const categoryCounter = new Map<string, number>();
    const validDates: Date[] = [];

    this.filteredEvents.forEach((event: any) => {
      const category = event?.category ? String(event.category) : 'Unknown';
      categoryCounter.set(category, (categoryCounter.get(category) || 0) + 1);

      const dateValue = event?.date ? new Date(event.date) : null;
      if (dateValue && !Number.isNaN(dateValue.getTime())) {
        validDates.push(dateValue);
      }
    });

    this.categoryStats = Array.from(categoryCounter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (validDates.length === 0) {
      this.timeRangeText = 'No data';
      return;
    }

    const sortedDates = validDates.sort((a, b) => a.getTime() - b.getTime());
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];

    this.timeRangeText = `${firstDate.toLocaleDateString()} - ${lastDate.toLocaleDateString()}`;
  }

  private getMagnitudeDisplay(event: any): string {
    const magnitude = event?.magnitudeValue;
    const unit = event?.magnitudeUnit;

    if (magnitude == null) {
      return 'N/A';
    }

    // Conversión de acres a km²
    if (unit === 'acres') {
      const km2 = magnitude * 0.00404686;
      return `${magnitude} acres (${km2.toFixed(2)} km²)`;
    }

    // Otros units se muestran como están
    if (unit) {
      return `${magnitude} ${unit}`;
    }

    return String(magnitude);
  }

  private calculateMarkerRadius(event: any): number {
    const areaKm2 = this.getAreaKm2(event);

    if (areaKm2 <= 0) {
      return 6; // Radio por defecto si no hay magnitud
    }

    // Convertir área a radio: Area = π * r² => r = sqrt(Area / π)
    const radiusKm = Math.sqrt(areaKm2 / Math.PI);

    // Escalar a píxeles Leaflet (aproximadamente 1 píxel = 0.5 km en zoom 4)
    // Ajustamos la escala para que sea visible pero no demasiado grande
    const radiusPixels = Math.min(Math.max(radiusKm * 2, 6), 40); // Min 6px, Max 40px

    return radiusPixels;
  }

  private getHeatIntensity(event: any, maxVisibleAreaKm2: number): number {
    const areaKm2 = this.getAreaKm2(event);

    if (areaKm2 <= 0) {
      return 0.3; // Intensidad mínima por defecto
    }

    // Escala relativa al dataset visible. sqrt mejora contraste visual.
    const ratio = Math.sqrt(areaKm2 / maxVisibleAreaKm2);

    // Clamped entre 0.16 y 0.82 para suavizar el mapa de calor
    return Math.min(Math.max(ratio, 0.16), 0.82);
  }

  private getAreaKm2(event: any): number {
    const magnitude = Number(event?.magnitudeValue);
    const unitRaw = event?.magnitudeUnit ? String(event.magnitudeUnit) : '';
    const unit = unitRaw.trim().toLowerCase();

    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      return 0;
    }

    if (unit === 'acres') {
      return magnitude * 0.00404686;
    }

    if (unit === 'km²' || unit === 'km2' || unit === 'square kilometers') {
      return magnitude;
    }

    if (unit === 'hectares' || unit === 'ha') {
      return magnitude * 0.01;
    }

    return 0;
  }
}