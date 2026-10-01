import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

/** Legacy UI compatibility service. It only calls the backend API, never Supabase. */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private api = inject(ApiService);
  /**
   * Temporary query adapter for legacy screens. It serializes a fixed set of
   * query operations to the backend; it does not expose a database client to
   * the browser. New screens should use the resource methods below instead.
   */
  getClient(): any { return new ApiQueryClient(this.api); }
  async searchPatients(query: string, limit = 10) {
    const result = await firstValueFrom(this.api.post<any>('data/query', {
      table: 'patients', action: 'select', columns: 'id, hn, full_name, id_card',
      filters: [{ operator: 'or', value: `hn.ilike.%${query}%,full_name.ilike.%${query}%,id_card.ilike.%${query}%` }],
      ordering: [], limit
    }));
    return result.data || [];
  }
  async createAppointment(appointment: any) {
    const result = await this.createAppointmentAndNotify(appointment);
    return result.appointment;
  }
  async createAppointmentAndNotify(appointment: any) {
    return firstValueFrom(this.api.post<any>('data/appointments/create-and-notify', appointment));
  }
}

class ApiQueryClient {
  constructor(private api: ApiService) {}
  from(table: string) { return new ApiQuery(this.api, table); }
}

class ApiQuery {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private columns = '*';
  private count?: 'exact';
  private filters: Array<{ operator: string; column?: string; value: any }> = [];
  private ordering: Array<{ column: string; ascending: boolean }> = [];
  // Every legacy select is bounded. New code should use resource-specific API endpoints.
  private rowLimit?: number = 100;
  private rowOffset = 0;
  private payload: any;
  private one = false;
  private allowNull = false;

  constructor(private api: ApiService, private table: string) {}
  // Called both as the entry point (from().select()) and after insert/update/upsert
  // to request the written row back — it must not clobber the action in that case.
  select(columns = '*', options?: { count?: 'exact' }) { this.columns = columns; this.count = options?.count; return this; }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
  upsert(payload: any, _options?: { onConflict?: string }) {
    this.action = 'upsert';
    this.payload = payload;
    return this;
  }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  eq(column: string, value: any) { this.filters.push({ operator: 'eq', column, value }); return this; }
  neq(column: string, value: any) { this.filters.push({ operator: 'neq', column, value }); return this; }
  gte(column: string, value: any) { this.filters.push({ operator: 'gte', column, value }); return this; }
  lte(column: string, value: any) { this.filters.push({ operator: 'lte', column, value }); return this; }
  or(value: string) { this.filters.push({ operator: 'or', value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.ordering.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.rowLimit = value; return this; }
  range(from: number, to: number) {
    this.rowOffset = from;
    this.rowLimit = to - from + 1;
    return this;
  }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; this.allowNull = true; return this; }
  async all(): Promise<any> {
    if (this.action !== 'select' || this.one) throw new Error('all() is only available for list queries');
    const pageSize = Math.min(this.rowLimit || 100, 100);
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Query page size must be between 1 and 100');
    const rows: any[] = [];
    let count: number | null = null;
    for (let offset = this.rowOffset; offset <= 100_000; offset += pageSize) {
      const result = await firstValueFrom(this.api.post<any>('data/query', this.requestBody(pageSize, offset)));
      if (result.error) throw result.error;
      const page = Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data];
      rows.push(...page);
      count = result.count ?? count;
      if (page.length < pageSize) return { data: rows, error: null, count };
    }
    throw new Error('Query returned too many rows to load at once');
  }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return firstValueFrom(this.api.post<any>('data/query', this.requestBody(this.rowLimit, this.rowOffset)))
      .then(onfulfilled, onrejected);
  }
  private requestBody(limit = this.rowLimit, offset = this.rowOffset) {
    return {
      table: this.table, action: this.action, columns: this.columns, count: this.count, filters: this.filters,
      ordering: this.ordering, limit, offset, payload: this.payload, one: this.one, allowNull: this.allowNull
    };
  }
}
