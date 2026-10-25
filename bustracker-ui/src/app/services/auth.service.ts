import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
export interface User { id: number; name: string; email: string; role: 'user' | 'admin'; }
interface AuthResponse { user: User; token: string; }
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = `${environment.apiUrl}/auth`;
  constructor(private http: HttpClient) {}
  get token(): string | null { return localStorage.getItem('bustracker_token'); }
  get userName(): string { return localStorage.getItem('bustracker_name') || ''; }
  get role(): string { return localStorage.getItem('bustracker_role') || 'user'; }
  get isAdmin(): boolean { return this.role === 'admin'; }
  get isLoggedIn(): boolean { return !!this.token; }
  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.base}/login`, { email, password }).pipe(tap(r => this.save(r)));
  }
  register(name: string, email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.base}/register`, { name, email, password }).pipe(tap(r => this.save(r)));
  }
  logout() { localStorage.removeItem('bustracker_token'); localStorage.removeItem('bustracker_name'); localStorage.removeItem('bustracker_role'); }
  private save(r: AuthResponse) {
    localStorage.setItem('bustracker_token', r.token);
    localStorage.setItem('bustracker_name', r.user.name);
    localStorage.setItem('bustracker_role', r.user.role || 'user');
  }
}
