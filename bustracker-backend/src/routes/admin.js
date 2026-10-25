const router = require('express').Router();
const { pool } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { HttpError } = require('../utils/httpError');
const { isValidCoord, normalizePlate, isValidPlate } = require('../utils/geo');
router.use(requireAuth, requireAdmin);
const id = v => { const n=Number(v); if(!Number.isInteger(n)||n<1) throw new HttpError(400,'Identifiant invalide'); return n; };
router.get('/users', async (_req,res)=>{
 const {rows}=await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC LIMIT 500'); res.json(rows);
});
router.patch('/users/:id/role', async (req,res)=>{
 const userId=id(req.params.id), role=String(req.body?.role??'');
 if(!['user','admin'].includes(role)) throw new HttpError(400,'Rôle invalide');
 if(userId===Number(req.user.id) && role!=='admin') throw new HttpError(400,'Tu ne peux pas retirer ton propre rôle administrateur');
 const target=(await pool.query('SELECT id,role FROM users WHERE id=$1',[userId])).rows[0];
 if(!target) throw new HttpError(404,'Utilisateur introuvable');
 if(target.role==='admin' && role==='user') {
  const count=Number((await pool.query("SELECT count(*)::int AS n FROM users WHERE role='admin'")).rows[0].n);
  if(count<=1) throw new HttpError(409,'Impossible de retirer le rôle du dernier administrateur');
 }
 const {rows}=await pool.query('UPDATE users SET role=$2 WHERE id=$1 RETURNING id,name,email,role,created_at',[userId,role]); res.json(rows[0]);
});
router.get('/summary', async (_req,res) => {
 const [b,l,s] = await Promise.all([
  pool.query("SELECT count(*)::int total, count(*) FILTER (WHERE approval_status='pending')::int pending, count(*) FILTER (WHERE approval_status='approved')::int approved FROM buses"),
  pool.query('SELECT count(*)::int total FROM lines'), pool.query('SELECT count(*)::int total FROM stops')]);
 res.json({buses:b.rows[0],lines:l.rows[0].total,stops:s.rows[0].total});
});
router.get('/buses', async (_req,res)=> { const {rows}=await pool.query(`SELECT b.id,b.registration_number,b.bus_number,b.status,b.approval_status,b.line_id,l.number AS line_number FROM buses b LEFT JOIN lines l ON l.id=b.line_id ORDER BY CASE b.approval_status WHEN 'pending' THEN 0 ELSE 1 END,b.bus_number`); res.json(rows); });
router.post('/buses', async (req,res)=>{
 const plate=normalizePlate(req.body?.registrationNumber); const number=String(req.body?.busNumber??'').trim(); const lineId=req.body?.lineId? id(req.body.lineId):null;
 if(!isValidPlate(plate)) throw new HttpError(400,'Immatriculation invalide (3 à 12 lettres/chiffres)');
 if(!number||number.length>10) throw new HttpError(400,'Numéro de bus requis (10 caractères maximum)');
 const {rows}=await pool.query(`INSERT INTO buses(registration_number,bus_number,line_id,approval_status,created_by) VALUES($1,$2,$3,'pending',$4) RETURNING id,registration_number,bus_number,status,approval_status,line_id`,[plate,number,lineId,req.user.id]);
 res.status(201).json(rows[0]);
});
router.patch('/buses/:id', async (req,res)=>{
 const busId=id(req.params.id), plate=normalizePlate(req.body?.registrationNumber), number=String(req.body?.busNumber??'').trim(), lineId=req.body?.lineId==null||req.body.lineId===''?null:id(req.body.lineId);
 if(!isValidPlate(plate)) throw new HttpError(400,'Immatriculation invalide (3 à 12 lettres/chiffres)');
 if(!number||number.length>10) throw new HttpError(400,'Numéro de bus requis (10 caractères maximum)');
 const {rows}=await pool.query(`UPDATE buses SET registration_number=$2,bus_number=$3,line_id=$4 WHERE id=$1 RETURNING id,registration_number,bus_number,status,approval_status,line_id`,[busId,plate,number,lineId]);
 if(!rows[0]) throw new HttpError(404,'Bus introuvable'); res.json(rows[0]);
});
// Suppression logique : on conserve l'historique des signalements et des positions.
router.delete('/buses/:id', async (req,res)=>{
 const busId=id(req.params.id);
 const {rows}=await pool.query(`UPDATE buses SET status='inactive',approval_status='rejected' WHERE id=$1 RETURNING id`,[busId]);
 if(!rows[0]) throw new HttpError(404,'Bus introuvable'); res.json({ok:true});
});
router.patch('/buses/:id/approval', async (req,res)=>{
 const busId=id(req.params.id), status=String(req.body?.status??''); if(!['approved','rejected','pending'].includes(status)) throw new HttpError(400,'Statut de validation invalide');
 const {rows}=await pool.query('UPDATE buses SET approval_status=$2 WHERE id=$1 RETURNING id,registration_number,bus_number,status,approval_status,line_id',[busId,status]);
 if(!rows[0]) throw new HttpError(404,'Bus introuvable'); res.json(rows[0]);
});
router.patch('/buses/:id/line', async (req,res)=>{
 const busId=id(req.params.id), lineId=req.body?.lineId==null?null:id(req.body.lineId);
 const {rows}=await pool.query('UPDATE buses SET line_id=$2 WHERE id=$1 RETURNING id,registration_number,bus_number,approval_status,line_id',[busId,lineId]);
 if(!rows[0]) throw new HttpError(404,'Bus introuvable'); res.json(rows[0]);
});
router.get('/lines', async (_req,res)=>{ const {rows}=await pool.query('SELECT id,number,name,terminus_a,terminus_b,operator FROM lines ORDER BY number'); res.json(rows); });
router.post('/lines', async (req,res)=>{
 const number=String(req.body?.number??'').trim().toUpperCase(), name=String(req.body?.name??'').trim(), a=String(req.body?.terminusA??'').trim(), b=String(req.body?.terminusB??'').trim(), operator=String(req.body?.operator??'').trim()||null;
 if(!number||!name||!a||!b) throw new HttpError(400,'Numéro, nom et terminus A/B obligatoires');
 const {rows}=await pool.query('INSERT INTO lines(number,name,terminus_a,terminus_b,operator,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,number,name,terminus_a,terminus_b,operator',[number,name,a,b,operator,req.user.id]); res.status(201).json(rows[0]);
});
router.get('/stops', async (_req,res)=>{ const {rows}=await pool.query('SELECT id,name,ST_Y(location::geometry) latitude,ST_X(location::geometry) longitude FROM stops ORDER BY name LIMIT 500'); res.json(rows); });
router.post('/stops', async (req,res)=>{
 const name=String(req.body?.name??'').trim(); const lat=Number(req.body?.lat),lng=Number(req.body?.lng);
 if(!name||name.length>100) throw new HttpError(400,"Nom d'arrêt requis (100 caractères maximum)");
 if(!isValidCoord(lat,lng)||lat < -20.6||lat > -19.9||lng < 57.2||lng > 57.9) throw new HttpError(400,'Coordonnées invalides ou hors de Maurice');
 const {rows}=await pool.query('INSERT INTO stops(name,location,created_by) VALUES($1,ST_SetSRID(ST_MakePoint($3::float8,$2::float8),4326)::geography,$4) RETURNING id,name,ST_Y(location::geometry) latitude,ST_X(location::geometry) longitude',[name,lat,lng,req.user.id]); res.status(201).json(rows[0]);
});
router.put('/lines/:id/stops', async (req,res)=>{
 const lineId=id(req.params.id), direction=String(req.body?.direction??'').toUpperCase(), stopIds=req.body?.stopIds;
 if(!['AB','BA'].includes(direction)) throw new HttpError(400,'Sens AB ou BA requis');
 if(!Array.isArray(stopIds)||stopIds.length<2||stopIds.length>150) throw new HttpError(400,'Sélectionnez au moins 2 arrêts');
 const ids=stopIds.map(id); if(new Set(ids).size!==ids.length) throw new HttpError(400,'Un arrêt ne peut apparaître deux fois');
 const c=await pool.connect(); try { await c.query('BEGIN'); const line=(await c.query('SELECT id FROM lines WHERE id=$1 FOR UPDATE',[lineId])).rows[0]; if(!line) throw new HttpError(404,'Ligne introuvable');
 await c.query('DELETE FROM line_stops WHERE line_id=$1 AND direction=$2',[lineId,direction]); await c.query('INSERT INTO line_stops(line_id,direction,seq,stop_id) SELECT $1,$2,t.ord::smallint,t.stop_id FROM unnest($3::int[]) WITH ORDINALITY t(stop_id,ord)',[lineId,direction,ids]); await c.query('UPDATE lines SET updated_at=now() WHERE id=$1',[lineId]); await c.query('COMMIT'); } catch(e) { await c.query('ROLLBACK').catch(()=>{}); throw e; } finally { c.release(); }
 res.json({ok:true,count:ids.length});
});
module.exports=router;
