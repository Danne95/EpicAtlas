import type { FlightAirport } from '../types/travel';
import { validPoint } from './coordinates';

const cache = new Map<string, FlightAirport>();
export async function resolveAirport(value: string, existing?: FlightAirport): Promise<FlightAirport> {
  const code = value.trim().toUpperCase();
  // Keep existing saved coordinates when editing dates, including older codes.
  if (existing?.code.toUpperCase() === code) return structuredClone(existing);
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Enter a three-letter IATA airport code.');
  const cached = cache.get(code);
  if (cached) return structuredClone(cached);
  let response: Response;
  try { response = await fetch(`${import.meta.env.BASE_URL}api/airports?code=${code}`); }
  catch { throw new Error('Local airport lookup is unavailable. Check that the atlas server is running.'); }
  const answer = await response.json();
  if (!response.ok) throw new Error(answer.error || `Could not find airport ${code}.`);
  const airport = answer.airport as FlightAirport;
  if (airport?.code !== code || typeof airport.name !== 'string' || !airport.name.trim() || !validPoint(airport.coordinates)) throw new Error('Invalid airport catalogue result; flight has not been saved.');
  cache.set(code, airport);
  return structuredClone(airport);
}
