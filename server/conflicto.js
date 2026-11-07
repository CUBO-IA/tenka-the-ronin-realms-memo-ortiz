// Alianzas, tropas y ataques. Todo se calcula acá, en el servidor; el modelo
// solo elige entre las opciones que estas funciones declaran válidas.

import { guardarMensaje, obtenerEdificios, obtenerRecursos } from './acciones.js';
import { ErrorDeJuego } from './errores.js';
import { infoEdificio, reglas, tropasDeBando } from './reglas.js';
import { serializarRonin } from './ronin.js';

const conf = () => reglas.conflicto;

function filaRonin(db, id) {
  return db.prepare('SELECT * FROM ronin WHERE id = ?').get(id) || null;
}

function inicialDe(ronin) {
  return ronin.nombre ? ronin.nombre[0].toUpperCase() : 'R';
}

// ---------- Tropas ----------

export function tropasDe(db, roninId) {
  const mapa = {};
  for (const fila of db.prepare('SELECT tipo, cantidad FROM tropas WHERE ronin_id = ?').all(roninId)) {
    mapa[fila.tipo] = fila.cantidad;
  }
  return mapa;
}

export function sumarTropa(db, roninId, tipo, cantidad) {
  db.prepare(
    `INSERT INTO tropas (ronin_id, tipo, cantidad) VALUES (?, ?, ?)
     ON CONFLICT(ronin_id, tipo) DO UPDATE SET cantidad = MAX(0, cantidad + excluded.cantidad)`,
  ).run(roninId, tipo, cantidad);
}

export function opcionesDeEntrenar(db, ronin) {
  if (ronin.era < conf().desdeEra) return [];
  const recursos = obtenerRecursos(db, ronin.id);
  return tropasDeBando(ronin.bando)
    .filter((t) => Object.entries(t.costo).every(([r, n]) => (recursos[r] || 0) >= n))
    .map((t) => ({
      accion: 'entrenar',
      parametros: { tropa: t.tipo },
      etiqueta: `Train a ${t.etiqueta.toLowerCase()}`,
    }));
}

// Descuenta el costo y deja al rōnin entrenando; la tropa llega cuando termina.
export function iniciarEntrenamiento(db, ronin, tipo, ahora) {
  const def = conf().tropas[tipo];
  if (!def || def.bando !== ronin.bando) {
    throw new ErrorDeJuego('Your path cannot train that.', 400, 'TROPA_INVALIDA');
  }
  if (ronin.era < conf().desdeEra) {
    throw new ErrorDeJuego(`Troops can be trained from Era ${conf().desdeEra}.`, 400, 'ERA_INSUFICIENTE');
  }
  const recursos = obtenerRecursos(db, ronin.id);
  for (const [recurso, necesario] of Object.entries(def.costo)) {
    if ((recursos[recurso] || 0) < necesario) {
      throw new ErrorDeJuego(`Not enough ${recurso} to train a ${def.etiqueta.toLowerCase()}.`, 400, 'RECURSOS_INSUFICIENTES');
    }
  }
  const tarea = { accion: 'entrenar', parametros: { tropa: tipo, cantidad: 1 } };
  db.transaction(() => {
    const restar = db.prepare('UPDATE recursos SET cantidad = cantidad - ? WHERE ronin_id = ? AND tipo = ?');
    for (const [recurso, n] of Object.entries(def.costo)) restar.run(n, ronin.id, recurso);
    db.prepare('UPDATE ronin SET estado = ?, tarea = ?, tarea_fin = ? WHERE id = ?').run(
      'entrenando',
      JSON.stringify(tarea),
      ahora + conf().entrenarMs,
      ronin.id,
    );
    db.prepare('UPDATE mensajes SET respondido = 1, respuesta = ? WHERE ronin_id = ? AND respondido = 0').run(
      'entrenar',
      ronin.id,
    );
  })();
  return { tarea, duracionMs: conf().entrenarMs };
}

// ---------- Alianzas ----------

export function alianzaEntre(db, a, b) {
  return (
    db
      .prepare(
        `SELECT * FROM alianzas WHERE ((clan_a = ? AND clan_b = ?) OR (clan_a = ? AND clan_b = ?))
         AND estado IN ('propuesta', 'activa') ORDER BY id DESC LIMIT 1`,
      )
      .get(a, b, b, a) || null
  );
}

export function aliadosDe(db, roninId) {
  return db
    .prepare("SELECT clan_a, clan_b FROM alianzas WHERE estado = 'activa' AND (clan_a = ? OR clan_b = ?)")
    .all(roninId, roninId)
    .map((fila) => (fila.clan_a === roninId ? fila.clan_b : fila.clan_a));
}

export function alianzasActivas(db) {
  return db.prepare("SELECT id, clan_a, clan_b FROM alianzas WHERE estado = 'activa'").all();
}

export function propuestasPara(db, roninId) {
  return db
    .prepare("SELECT * FROM alianzas WHERE estado = 'propuesta' AND clan_b = ?")
    .all(roninId);
}

function otrosRonin(db, ronin) {
  return db
    .prepare('SELECT * FROM ronin WHERE id != ? AND territorio IS NOT NULL ORDER BY id')
    .all(ronin.id);
}

export function opcionesDeAlianza(db, ronin) {
  const opciones = [];
  for (const propuesta of propuestasPara(db, ronin.id)) {
    const otro = filaRonin(db, propuesta.clan_a);
    if (!otro) continue;
    opciones.push({
      accion: 'responder_alianza',
      parametros: { alianza: propuesta.id, respuesta: 'aceptar' },
      etiqueta: `Accept ${otro.nombre}'s alliance`,
      objetivo: otro.nombre,
    });
    opciones.push({
      accion: 'responder_alianza',
      parametros: { alianza: propuesta.id, respuesta: 'rechazar' },
      etiqueta: `Refuse ${otro.nombre}'s alliance`,
      objetivo: otro.nombre,
    });
  }
  for (const otro of otrosRonin(db, ronin)) {
    if (alianzaEntre(db, ronin.id, otro.id)) continue;
    opciones.push({
      accion: 'proponer_alianza',
      parametros: { clan: otro.id },
      etiqueta: `Propose an alliance to ${otro.nombre}`,
      objetivo: otro.nombre,
    });
  }
  return opciones;
}

// Devuelve el mensaje que recibe el otro maestro, para avisarle en vivo.
export function proponerAlianza(db, ronin, clanId) {
  const otro = filaRonin(db, clanId);
  if (!otro || otro.id === ronin.id) {
    throw new ErrorDeJuego('There is no such clan.', 404, 'CLAN_NO_ENCONTRADO');
  }
  if (alianzaEntre(db, ronin.id, otro.id)) {
    throw new ErrorDeJuego('There is already a thread between your clans.', 409, 'ALIANZA_EXISTENTE');
  }
  const ahora = Date.now();
  const info = db
    .prepare("INSERT INTO alianzas (clan_a, clan_b, estado, creada) VALUES (?, ?, 'propuesta', ?)")
    .run(ronin.id, otro.id, ahora);
  const alianzaId = Number(info.lastInsertRowid);
  db.prepare('UPDATE mensajes SET respondido = 1, respuesta = ? WHERE ronin_id = ? AND respondido = 0').run(
    'proponer_alianza',
    ronin.id,
  );

  const texto = `Master, ${ronin.nombre} of the ${otro.bando === ronin.bando ? 'same path' : 'other path'} offers an alliance: a red thread between our clans. Shall I accept? — ${inicialDe(otro)}.`;
  const opciones = [
    { accion: 'responder_alianza', parametros: { alianza: alianzaId, respuesta: 'aceptar' }, etiqueta: `Accept ${ronin.nombre}'s alliance` },
    { accion: 'responder_alianza', parametros: { alianza: alianzaId, respuesta: 'rechazar' }, etiqueta: `Refuse ${ronin.nombre}'s alliance` },
  ];
  const mensajeOtro = guardarMensaje(db, otro.id, texto, opciones);
  return { alianzaId, otro: serializarRonin(otro), mensajeOtro, usuarioOtro: otro.usuario_id };
}

export function responderAlianza(db, ronin, alianzaId, respuesta) {
  const alianza = db.prepare('SELECT * FROM alianzas WHERE id = ?').get(alianzaId);
  if (!alianza || alianza.clan_b !== ronin.id || alianza.estado !== 'propuesta') {
    throw new ErrorDeJuego('That alliance is not waiting for you.', 404, 'ALIANZA_NO_ENCONTRADA');
  }
  const acepta = respuesta === 'aceptar';
  db.prepare('UPDATE alianzas SET estado = ? WHERE id = ?').run(acepta ? 'activa' : 'rechazada', alianzaId);
  db.prepare('UPDATE mensajes SET respondido = 1, respuesta = ? WHERE ronin_id = ? AND respondido = 0').run(
    'responder_alianza',
    ronin.id,
  );
  const otro = filaRonin(db, alianza.clan_a);
  const texto = acepta
    ? `Master, ${ronin.nombre} accepted. A red thread now binds our clans; their walls will answer when ours are struck. — ${inicialDe(otro)}.`
    : `Master, ${ronin.nombre} refused the alliance. We stand alone for now. — ${inicialDe(otro)}.`;
  const mensajeOtro = guardarMensaje(db, otro.id, texto, []);
  return { acepta, otro: serializarRonin(otro), mensajeOtro, usuarioOtro: otro.usuario_id };
}

// ---------- Ataques ----------

// Lo que suman los edificios terminados de la era 2 (forja, muro, torre…).
export function efectosDeEdificios(db, ronin) {
  const total = { ataque: 0, defensa: 0, produce: {}, vigia: false };
  for (const e of obtenerEdificios(db, ronin.id)) {
    if (e.etapa !== 'terminado') continue;
    const efecto = infoEdificio(ronin.bando, e.tipo)?.efecto;
    if (!efecto) continue;
    total.ataque += efecto.ataque || 0;
    total.defensa += efecto.defensa || 0;
    if (efecto.vigia) total.vigia = true;
    for (const [recurso, n] of Object.entries(efecto.produce || {})) {
      total.produce[recurso] = (total.produce[recurso] || 0) + n;
    }
  }
  return total;
}

// De dónde sale cada fuerza, para que el rōnin pueda explicar la batalla.
export function desgloseDefensa(db, ronin, conAliados = true) {
  const c = conf();
  const terminados = obtenerEdificios(db, ronin.id).filter((e) => e.etapa === 'terminado').length;
  const efectos = efectosDeEdificios(db, ronin);
  let tropas = 0;
  for (const [tipo, cantidad] of Object.entries(tropasDe(db, ronin.id))) {
    tropas += (c.tropas[tipo]?.defensa || 0) * cantidad;
  }
  // La defensa del aliado se cuenta sin sus propios aliados, para no girar en círculo.
  let aliados = 0;
  if (conAliados) {
    for (const aliadoId of aliadosDe(db, ronin.id)) {
      const aliado = filaRonin(db, aliadoId);
      if (aliado) aliados += fuerzaDefensaPropia(db, aliado) * c.aliadoPorcentaje;
    }
  }
  return {
    base: c.defensaBase,
    era: ronin.era * c.porEra,
    edificios: terminados * c.porEdificioTerminado,
    murallas: efectos.defensa,
    tropas,
    aliados,
  };
}

export function desgloseAtaque(db, ronin) {
  const c = conf();
  let tropas = 0;
  for (const [tipo, cantidad] of Object.entries(tropasDe(db, ronin.id))) {
    tropas += (c.tropas[tipo]?.ataque || 0) * cantidad;
  }
  return { base: c.ataqueBase, era: ronin.era * c.porEra, forja: efectosDeEdificios(db, ronin).ataque, tropas };
}

const sumar = (desglose) => Object.values(desglose).reduce((a, b) => a + b, 0);

export function fuerzaDefensaPropia(db, ronin) {
  const d = desgloseDefensa(db, ronin, false);
  return d.base + d.era + d.edificios + d.murallas + d.tropas;
}

export function fuerzaDefensa(db, ronin) {
  return sumar(desgloseDefensa(db, ronin));
}

export function fuerzaAtaque(db, ronin) {
  return sumar(desgloseAtaque(db, ronin));
}

// null si se puede atacar; si no, el motivo en inglés.
export function motivoNoAtacar(db, atacante, defensor, ahora = Date.now()) {
  const c = conf();
  if (!defensor || defensor.id === atacante.id) return 'There is no such clan.';
  if (atacante.era < c.desdeEra) return `You can march from Era ${c.desdeEra}.`;
  if (defensor.era < c.desdeEra) return `${defensor.nombre}'s sanctuary is still hidden in the mist.`;
  if (alianzaEntre(db, atacante.id, defensor.id)?.estado === 'activa') return `${defensor.nombre} is your ally.`;
  if (defensor.escudo_hasta && defensor.escudo_hasta > ahora) return `${defensor.nombre}'s sanctuary is shielded.`;
  return null;
}

export function opcionesDeAtaque(db, ronin, ahora = Date.now()) {
  if (ronin.era < conf().desdeEra) return [];
  return otrosRonin(db, ronin)
    .filter((otro) => !motivoNoAtacar(db, ronin, otro, ahora))
    .map((otro) => ({
      accion: 'atacar',
      parametros: { clan: otro.id },
      etiqueta: `Attack ${otro.nombre}'s sanctuary`,
      objetivo: otro.nombre,
    }));
}

// El rōnin marcha: la batalla se resuelve cuando llega (reloj).
export function iniciarAtaque(db, ronin, clanId, ahora = Date.now()) {
  const defensor = filaRonin(db, clanId);
  const motivo = motivoNoAtacar(db, ronin, defensor, ahora);
  if (motivo) throw new ErrorDeJuego(motivo, 400, 'ATAQUE_INVALIDO');

  const tarea = { accion: 'atacar', parametros: { clan: defensor.id } };
  db.transaction(() => {
    db.prepare('UPDATE ronin SET estado = ?, tarea = ?, tarea_fin = ? WHERE id = ?').run(
      'atacando',
      JSON.stringify(tarea),
      ahora + conf().marchaMs,
      ronin.id,
    );
    db.prepare('UPDATE mensajes SET respondido = 1, respuesta = ? WHERE ronin_id = ? AND respondido = 0').run(
      'atacar',
      ronin.id,
    );
  })();

  // La torre o el farol avisan al defensor antes de que llegue el golpe; sin
  // vigía, el rōnin solo alcanza a ver el polvo en el camino.
  const vigia = efectosDeEdificios(db, defensor).vigia;
  const aviso = guardarMensaje(
    db,
    defensor.id,
    vigia
      ? `Master, the ${defensor.bando === 'luz' ? 'watchtower' : 'spirit lantern'} warns: ${ronin.nombre} marches against our sanctuary! I will hold the gate. — ${inicialDe(defensor)}.`
      : `Master, dust on the road: ${ronin.nombre} is coming for our sanctuary! I will hold the gate. — ${inicialDe(defensor)}.`,
    [],
  );
  return {
    tarea,
    duracionMs: conf().marchaMs,
    defensor: serializarRonin(defensor),
    usuarioDefensor: defensor.usuario_id,
    mensajeDefensor: aviso,
    llegada: ahora + conf().marchaMs,
  };
}

function azar(fuerza, semilla) {
  const factor = 1 + (semilla * 2 - 1) * conf().azar;
  return Math.round(fuerza * factor * 10) / 10;
}

// Resuelve una batalla y aplica sus consecuencias. `aleatorio` se inyecta en pruebas.
export function resolverBatalla(db, atacante, defensorId, ahora = Date.now(), aleatorio = Math.random) {
  const c = conf();
  const defensor = filaRonin(db, defensorId);
  if (!defensor) return null;

  const desglose = { ataque: desgloseAtaque(db, atacante), defensa: desgloseDefensa(db, defensor) };
  const ataqueBruto = sumar(desglose.ataque);
  const defensaBruta = sumar(desglose.defensa);
  const ataque = azar(ataqueBruto, aleatorio());
  const defensa = azar(defensaBruta, aleatorio());
  const ganaAtacante = ataque > defensa;
  const botin = {};
  let edificioDanado = null;
  let tropasPerdidas = {};

  db.transaction(() => {
    if (ganaAtacante) {
      // Botín: una parte de cada recurso del defensor pasa al atacante.
      for (const [tipo, cantidad] of Object.entries(obtenerRecursos(db, defensor.id))) {
        const toma = Math.floor(cantidad * c.botinPorcentaje);
        if (toma <= 0) continue;
        botin[tipo] = toma;
        db.prepare('UPDATE recursos SET cantidad = cantidad - ? WHERE ronin_id = ? AND tipo = ?').run(toma, defensor.id, tipo);
        db.prepare(
          `INSERT INTO recursos (ronin_id, tipo, cantidad) VALUES (?, ?, ?)
           ON CONFLICT(ronin_id, tipo) DO UPDATE SET cantidad = cantidad + excluded.cantidad`,
        ).run(atacante.id, tipo, toma);
      }
      // Un edificio del defensor baja una etapa.
      const edificios = obtenerEdificios(db, defensor.id).filter((e) => e.etapa !== 'cimientos');
      if (edificios.length) {
        const golpeado = edificios[Math.floor(aleatorio() * edificios.length)];
        const nuevaEtapa = golpeado.etapa === 'terminado' ? 'construccion' : 'cimientos';
        db.prepare('UPDATE edificios SET etapa = ?, progreso = 100, actualizado = ? WHERE id = ?').run(nuevaEtapa, ahora, golpeado.id);
        edificioDanado = { ...golpeado, etapa: nuevaEtapa };
      }
    } else {
      // El atacante pierde parte de sus tropas.
      for (const [tipo, cantidad] of Object.entries(tropasDe(db, atacante.id))) {
        const pierde = Math.ceil(cantidad * c.tropasPerdidasAlPerder);
        if (pierde > 0) {
          tropasPerdidas[tipo] = pierde;
          sumarTropa(db, atacante.id, tipo, -pierde);
        }
      }
    }
    // El santuario atacado queda protegido un tiempo.
    db.prepare('UPDATE ronin SET escudo_hasta = ? WHERE id = ?').run(ahora + c.escudoMs, defensor.id);
    db.prepare(
      'INSERT INTO batallas (atacante, defensor, ataque, defensa, resultado, botin_json, hora) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(atacante.id, defensor.id, ataque, defensa, ganaAtacante ? 'atacante' : 'defensor', JSON.stringify(botin), ahora);
  })();

  return {
    atacante: serializarRonin(filaRonin(db, atacante.id)),
    defensor: serializarRonin(filaRonin(db, defensor.id)),
    usuarioDefensor: defensor.usuario_id,
    ataque,
    defensa,
    ataqueBruto,
    defensaBruta,
    desglose,
    ganador: ganaAtacante ? 'atacante' : 'defensor',
    botin,
    edificioDanado,
    tropasPerdidas,
    escudoHasta: ahora + c.escudoMs,
  };
}

// Las últimas batallas del rōnin, para que recuerde y aprenda.
export function historialDeBatallas(db, roninId, limite = 3) {
  return db
    .prepare(
      `SELECT b.atacante, b.defensor, b.ataque, b.defensa, b.resultado, b.hora,
              ra.nombre AS nombreAtacante, rd.nombre AS nombreDefensor
       FROM batallas b
       JOIN ronin ra ON ra.id = b.atacante
       JOIN ronin rd ON rd.id = b.defensor
       WHERE b.atacante = ? OR b.defensor = ?
       ORDER BY b.id DESC LIMIT ?`,
    )
    .all(roninId, roninId, limite)
    .map((b) => ({
      papel: b.atacante === roninId ? 'atacante' : 'defensor',
      contra: b.atacante === roninId ? b.nombreDefensor : b.nombreAtacante,
      ganamos: (b.atacante === roninId) === (b.resultado === 'atacante'),
      ataque: b.ataque,
      defensa: b.defensa,
      hora: b.hora,
    }));
}

// El factor que más pesó del otro lado, en palabras del rōnin.
function mayorFactor(desglose, etiquetas) {
  // Las etiquetas van en orden de utilidad: ante empate gana lo que se puede cambiar.
  let mejor = null;
  for (const clave of Object.keys(etiquetas)) {
    const valor = desglose[clave] || 0;
    if (valor <= 0) continue;
    if (!mejor || valor > mejor.valor) mejor = { clave, valor };
  }
  return mejor ? etiquetas[mejor.clave] : null;
}

const FACTORES_DEFENSA = {
  murallas: 'their walls and towers',
  aliados: 'their allies',
  tropas: 'their troops',
  edificios: 'their finished buildings',
  era: 'their era',
};
const FACTORES_ATAQUE = { tropas: 'their troops', forja: 'their forge', era: 'their era' };

// Consejo concreto según lo que falta, elegido entre lo que el rōnin puede hacer.
function consejoDeAtaque(desglose, bando) {
  const tropa = bando === 'sombra' ? 'oni' : 'samurai';
  const fragua = bando === 'sombra' ? 'cauldron' : 'forge';
  if (!desglose.ataque.tropas) return `Next time we march with ${tropa}: train two before we return.`;
  if (!desglose.ataque.forja) return `Our blades need the ${fragua}: finish it and our strike grows.`;
  return `More ${tropa}, or an ally whose thread tips the balance, and we return stronger.`;
}

function consejoDeDefensa(desglose, bando) {
  const muro = bando === 'sombra' ? 'thorn wall' : 'palisade';
  const vigia = bando === 'sombra' ? 'spirit lantern' : 'watchtower';
  if (!desglose.defensa.murallas) return `Raise the ${muro} and the ${vigia}: walls hold what blades cannot.`;
  if (!desglose.defensa.tropas) return `A few trained warriors at the gate would turn the next raid.`;
  if (!desglose.defensa.aliados) return `A red thread with another clan would lend us their walls.`;
  return 'We are strong; keep the sanctuary whole and the shield will buy us time.';
}

// Textos predefinidos del resultado, para los dos maestros.
export function textosDeBatalla(resultado) {
  const { atacante, defensor, ganador, botin, edificioDanado, desglose, ataque, defensa } = resultado;
  const saqueo = Object.entries(botin)
    .map(([tipo, n]) => `${n} ${tipo}`)
    .join(', ');
  const marcador = `(${Math.round(ataque)} against ${Math.round(defensa)})`;
  const factorDefensa = desglose ? mayorFactor(desglose.defensa, FACTORES_DEFENSA) : null;
  const factorAtaque = desglose ? mayorFactor(desglose.ataque, FACTORES_ATAQUE) : null;

  if (ganador === 'atacante') {
    return {
      atacante: `Master, ${defensor.nombre}'s gate fell ${marcador}. We return with ${saqueo || 'nothing but honor'}${edificioDanado ? ` and their ${edificioDanado.tipo} lies in ruins` : ''}. ${factorAtaque ? `What won it: ${factorAtaque.replace('their', 'our')}.` : ''} They will be shielded for a while; let us grow before they rebuild. — ${inicialDe(atacante)}.`,
      defensor: `Master, ${atacante.nombre} raided our sanctuary ${marcador}. They took ${saqueo || 'nothing'}${edificioDanado ? `; the ${edificioDanado.tipo} must be rebuilt` : ''}. ${factorAtaque ? `What beat us: ${factorAtaque}.` : ''} ${desglose ? consejoDeDefensa(desglose, defensor.bando) : ''} A shield guards us for now. — ${inicialDe(defensor)}.`,
    };
  }
  return {
    atacante: `Master, ${defensor.nombre}'s walls held ${marcador}. We retreat, bruised but alive. ${factorDefensa ? `What stopped us: ${factorDefensa}.` : ''} ${desglose ? consejoDeAtaque(desglose, atacante.bando) : ''} — ${inicialDe(atacante)}.`,
    defensor: `Master, ${atacante.nombre} struck our gate and was driven back ${marcador}. ${factorDefensa ? `What held: ${factorDefensa.replace('their', 'our')}.` : ''} ${desglose ? consejoDeDefensa(desglose, defensor.bando) : ''} — ${inicialDe(defensor)}.`,
  };
}
