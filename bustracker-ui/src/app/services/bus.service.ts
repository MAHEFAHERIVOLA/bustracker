import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
export interface BusPosition {
  id: number; bus_number: string; registration_number: string; status?: string; operational_state?: string;
  latitude: number; longitude: number; last_speed_kmh: number | null;
  last_update: string; line_number?: string; direction?: 'AB' | 'BA';
  reporters?: number; is_stale?: boolean; line_id?: number | null;
}
export interface BusStart { sessionId: number; busId: number; lineId: number | null; }
export interface Line { id: number; number: string; name: string; terminus_a: string; terminus_b: string; }
export interface Stop { id: number; name: string; latitude: number; longitude: number; }
export interface LineStop extends Stop { seq: number; }
export interface AdminBus { id:number; registration_number:string; bus_number:string; status:string; approval_status:'pending'|'approved'|'rejected'; line_id:number|null; line_number?:string|null; }
export interface AdminSummary { buses:{total:number;pending:number;approved:number}; lines:number; stops:number; }
export interface AdminUser {id:number;name:string;email:string;role:'user'|'admin';created_at:string;}
export interface BusReport { id:number; bus_id:number|null; registration_number:string|null; bus_number:string|null; line_id:number|null; stop_id:number|null; category:string; description:string|null; operational_state:string|null; latitude:number|null; longitude:number|null; review_status:'pending'|'in_review'|'approved'|'rejected'; admin_note:string|null; created_at:string; reporter_name?:string; stop_name?:string; line_number?:string; }
@Injectable({ providedIn: 'root' })
export class BusService {
  private readonly api = environment.apiUrl;
  constructor(private http: HttpClient) {}
  getPositions() { return this.http.get<BusPosition[]>(`${this.api}/tracking/buses`); }
  startTracking(data: { registrationNumber: string; busNumber: string; direction: 'AB'|'BA'; lineId?: number|null; boardingStopId?: number|null; lat?: number; lng?: number }) {
    return this.http.post<BusStart>(`${this.api}/tracking/start`, data);
  }
  sendPosition(sessionId: number, lat: number, lng: number, speedKmh: number | null) {
    return this.http.post<{ok:boolean}>(`${this.api}/tracking/${sessionId}/position`, { lat, lng, speedKmh });
  }
  stopTracking(sessionId: number) { return this.http.post<{ok:boolean}>(`${this.api}/tracking/${sessionId}/stop`, {}); }
  getLines() { return this.http.get<Line[]>(`${this.api}/lines`); }
  getStops() { return this.http.get<Stop[]>(`${this.api}/stops`); }
  getLineStops(lineId: number, direction: 'AB' | 'BA') { return this.http.get<LineStop[]>(`${this.api}/lines/${lineId}/stops`, { params: { direction } }); }
  createStop(name: string, lat: number, lng: number) { return this.http.post<Stop & { created: boolean }>(`${this.api}/stops`, { name, lat, lng }); }
  createLine(data: { number: string; name: string; terminusA: string; terminusB: string }) { return this.http.post<Line>(`${this.api}/lines`, data); }
  setLineStops(lineId: number, direction: 'AB' | 'BA', stopIds: number[]) { return this.http.put<{ ok: boolean; count: number }>(`${this.api}/lines/${lineId}/stops`, { direction, stopIds }); }
  getHealth() { return this.http.get<{status:string}>(`${this.api}/health`); }
  getAdminUsers() { return this.http.get<AdminUser[]>(`${this.api}/admin/users`); }
  setAdminUserRole(id:number,role:'user'|'admin') { return this.http.patch<AdminUser>(`${this.api}/admin/users/${id}/role`,{role}); }
  getAdminSummary() { return this.http.get<AdminSummary>(`${this.api}/admin/summary`); }
  getAdminBuses() { return this.http.get<AdminBus[]>(`${this.api}/admin/buses`); }
  createAdminBus(data:{registrationNumber:string;busNumber:string;lineId:number|null}) { return this.http.post<AdminBus>(`${this.api}/admin/buses`,data); }
  setBusApproval(id:number,status:'pending'|'approved'|'rejected') { return this.http.patch<AdminBus>(`${this.api}/admin/buses/${id}/approval`,{status}); }
  updateAdminBus(id:number,data:{registrationNumber:string;busNumber:string;lineId:number|null}) { return this.http.patch<AdminBus>(`${this.api}/admin/buses/${id}`,data); }
  deleteAdminBus(id:number) { return this.http.delete<{ok:boolean}>(`${this.api}/admin/buses/${id}`); }
  getReports(status='') { const params: Record<string, string> = status ? {status} : {}; return this.http.get<BusReport[]>(`${this.api}/reports/admin`, {params}); }
  reviewReport(id:number,status:'in_review'|'approved'|'rejected',adminNote='') { return this.http.patch<BusReport>(`${this.api}/reports/admin/${id}/review`,{status,adminNote}); }
  createReport(data:{busId?:number|null;registrationNumber?:string;busNumber?:string;lineId?:number|null;stopId?:number|null;category:string;state?:string|null;description?:string;lat?:number;lng?:number}) { return this.http.post<BusReport>(`${this.api}/reports`,data); }
  getAdminLines() { return this.http.get<Line[]>(`${this.api}/admin/lines`); }
  createAdminLine(data:{number:string;name:string;terminusA:string;terminusB:string;operator?:string}) { return this.http.post<Line>(`${this.api}/admin/lines`,data); }
  getAdminStops() { return this.http.get<Stop[]>(`${this.api}/admin/stops`); }
  createAdminStop(name:string,lat:number,lng:number) { return this.http.post<Stop>(`${this.api}/admin/stops`,{name,lat,lng}); }
  setAdminLineStops(lineId:number,direction:'AB'|'BA',stopIds:number[]) { return this.http.put<{ok:boolean;count:number}>(`${this.api}/admin/lines/${lineId}/stops`,{direction,stopIds}); }
}
