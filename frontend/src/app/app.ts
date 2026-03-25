import { Component, OnInit, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import { environment } from '../environments/environment'; // <-- 1. Importas la variable
@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit, AfterViewInit {
  private map: any;
  
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.initMap();
    this.fetchNASAEvents();
  }

  private initMap(): void {
    // Centramos el mapa inicialmente en el Océano Atlántico
    this.map = L.map('map').setView([20, -20], 3);

    // Usamos un mapa base en Modo Oscuro (Dark Matter) ideal para paneles espaciales
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors, © CARTO'
    }).addTo(this.map);
  }

  private fetchNASAEvents(): void {
    this.http.get<any>(this.apiUrl).subscribe({
      next: (data) => {
        data.events.forEach((event: any) => {
          // Dibujamos un círculo rojo brillante (tipo radar) por cada evento
          const marker = L.circleMarker([event.coordinates.lat, event.coordinates.lon], {
            radius: 6,
            fillColor: "#ff3300",
            color: "#ff0000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          });
          
          // Al hacer clic en el punto, sale un popup con la info
          marker.bindPopup(`
            <strong style="color: #ff3300;">${event.title}</strong><br>
            Categoría: ${event.category}<br>
            Fecha: ${new Date(event.date).toLocaleDateString()}
          `);
          
          marker.addTo(this.map);
        });
      },
      error: (err) => console.error('Error de conexión con el VPS:', err)
    });
  }
}