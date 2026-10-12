import type { Pack, PackNote } from './types';

/**
 * 스페인어 불규칙 동사 변화 (스페인). 여행에서 가장 자주 쓰는 불규칙 동사의 현재형과 과거형(pretérito).
 * 완전 불규칙(ser, ir, tener…)과 어간이 바뀌는 동사(e→ie, o→ue, e→i), yo만 불규칙한 동사(-go, -zco)를 모았다.
 * 카드 한 장 = 동사 하나의 한 시제 (6인칭: yo, tú, él, nosotros, vosotros, ellos).
 * 현재형을 먼저, 과거형은 뒤에 둔다.
 */
function c(verb: string, meaning: string, tense: string, f: [string, string, string, string, string, string], memo = ''): PackNote {
  const [yo, tu, el, nos, vos, ellos] = f;
  const kind = tense.startsWith('presente') ? '현재' : '과거';
  return { typeId: 'es-conj', fields: { verb, meaning, tense, yo, tu, el, nos, vos, ellos, memo }, tags: ['동사 변화', kind] };
}

export const spanishIrregularEs: Pack = {
  id: 'spanish-irregular-es',
  name: '스페인어 불규칙 동사 변화',
  description: '자주 쓰는 불규칙 동사 현재형 35개와 과거형 15개. 동사 하나를 보고 yo · tú · él · nosotros · vosotros · ellos 변화형을 떠올려요. 뜻과 예문은 영어예요.',
  deckName: '스페인어 불규칙 동사',
  deckSettings: {
    defaultTypeId: 'es-conj',
    reverseEnabled: false,
    newPerDay: 5,
    autoplay: 'back',
    langs: { front: 'es-ES', back: 'en-US' },
  },
  notes: [
    c('ser', 'to be (identity)', 'presente', ['soy', 'eres', 'es', 'somos', 'sois', 'son'], 'Permanent traits: nationality, job. Soy enfermera. I\'m a nurse.'),
    c('estar', 'to be (location, state)', 'presente', ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'], 'Where something is, how you feel. ¿Cómo estás? How are you?'),
    c('ir', 'to go', 'presente', ['voy', 'vas', 'va', 'vamos', 'vais', 'van'], 'Voy a + infinitive = I\'m going to… Voy a comer. I\'m going to eat.'),
    c('tener', 'to have', 'presente', ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'], 'Tengo hambre. I\'m hungry. · tener que + infinitive = must'),
    c('haber', 'to have (auxiliary); there is', 'presente', ['he', 'has', 'ha', 'hemos', 'habéis', 'han'], 'Perfect tense: He llegado. I have arrived. · hay = there is / there are'),
    c('hacer', 'to do, to make', 'presente', ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen'], 'Hace calor. It\'s hot. · hacer cola to queue'),
    c('decir', 'to say, to tell', 'presente', ['digo', 'dices', 'dice', 'decimos', 'decís', 'dicen'], 'e → i · ¿Cómo se dice…? How do you say…?'),
    c('poder', 'can, to be able to', 'presente', ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden'], 'o → ue · ¿Puedo pagar con tarjeta? Can I pay by card?'),
    c('querer', 'to want', 'presente', ['quiero', 'quieres', 'quiere', 'queremos', 'queréis', 'quieren'], 'e → ie · Quisiera… I\'d like… (polite)'),
    c('venir', 'to come', 'presente', ['vengo', 'vienes', 'viene', 'venimos', 'venís', 'vienen'], '-go + e → ie'),
    c('ver', 'to see', 'presente', ['veo', 'ves', 've', 'vemos', 'veis', 'ven'], 'Only the yo form is odd (veo)'),
    c('saber', 'to know (a fact)', 'presente', ['sé', 'sabes', 'sabe', 'sabemos', 'sabéis', 'saben'], 'Only yo is odd (sé) · No lo sé. I don\'t know.'),
    c('dar', 'to give', 'presente', ['doy', 'das', 'da', 'damos', 'dais', 'dan'], 'Only yo is odd (doy) · ¿Me da…? Could you give me…?'),
    c('poner', 'to put', 'presente', ['pongo', 'pones', 'pone', 'ponemos', 'ponéis', 'ponen'], '-go · ¿Me pone una caña? A small beer, please.'),
    c('salir', 'to leave, to go out', 'presente', ['salgo', 'sales', 'sale', 'salimos', 'salís', 'salen'], '-go · ¿A qué hora sale? What time does it leave?'),
    c('traer', 'to bring', 'presente', ['traigo', 'traes', 'trae', 'traemos', 'traéis', 'traen'], '-go · ¿Me trae la cuenta? Could you bring me the bill?'),
    c('conocer', 'to know (a person/place)', 'presente', ['conozco', 'conoces', 'conoce', 'conocemos', 'conocéis', 'conocen'], '-zco'),
    c('conducir', 'to drive', 'presente', ['conduzco', 'conduces', 'conduce', 'conducimos', 'conducís', 'conducen'], '-zco'),
    c('pedir', 'to order, to ask for', 'presente', ['pido', 'pides', 'pide', 'pedimos', 'pedís', 'piden'], 'e → i · Pido un café. I\'ll have a coffee.'),
    c('repetir', 'to repeat', 'presente', ['repito', 'repites', 'repite', 'repetimos', 'repetís', 'repiten'], 'e → i · ¿Puede repetir? Could you repeat that?'),
    c('seguir', 'to follow, to continue', 'presente', ['sigo', 'sigues', 'sigue', 'seguimos', 'seguís', 'siguen'], 'e → i · Siga recto. Go straight on.'),
    c('volver', 'to return', 'presente', ['vuelvo', 'vuelves', 'vuelve', 'volvemos', 'volvéis', 'vuelven'], 'o → ue'),
    c('devolver', 'to give back, to refund', 'presente', ['devuelvo', 'devuelves', 'devuelve', 'devolvemos', 'devolvéis', 'devuelven'], 'o → ue · ¿Me devuelve el dinero? Can I get a refund?'),
    c('dormir', 'to sleep', 'presente', ['duermo', 'duermes', 'duerme', 'dormimos', 'dormís', 'duermen'], 'o → ue'),
    c('costar', 'to cost', 'presente', ['cuesto', 'cuestas', 'cuesta', 'costamos', 'costáis', 'cuestan'], 'o → ue · ¿Cuánto cuesta? How much is it?'),
    c('doler', 'to hurt', 'presente', ['duelo', 'dueles', 'duele', 'dolemos', 'doléis', 'duelen'], 'o → ue · Me duele la cabeza. My head hurts.'),
    c('encontrar', 'to find', 'presente', ['encuentro', 'encuentras', 'encuentra', 'encontramos', 'encontráis', 'encuentran'], 'o → ue'),
    c('probar', 'to try, to taste', 'presente', ['pruebo', 'pruebas', 'prueba', 'probamos', 'probáis', 'prueban'], 'o → ue · ¿Puedo probármelo? Can I try it on?'),
    c('empezar', 'to start', 'presente', ['empiezo', 'empiezas', 'empieza', 'empezamos', 'empezáis', 'empiezan'], 'e → ie'),
    c('pensar', 'to think', 'presente', ['pienso', 'piensas', 'piensa', 'pensamos', 'pensáis', 'piensan'], 'e → ie'),
    c('cerrar', 'to close', 'presente', ['cierro', 'cierras', 'cierra', 'cerramos', 'cerráis', 'cierran'], 'e → ie · ¿A qué hora cierra? What time does it close?'),
    c('entender', 'to understand', 'presente', ['entiendo', 'entiendes', 'entiende', 'entendemos', 'entendéis', 'entienden'], 'e → ie · No entiendo. I don\'t understand.'),
    c('perder', 'to lose, to miss', 'presente', ['pierdo', 'pierdes', 'pierde', 'perdemos', 'perdéis', 'pierden'], 'e → ie · He perdido el tren. I\'ve missed the train.'),
    c('sentir', 'to feel', 'presente', ['siento', 'sientes', 'siente', 'sentimos', 'sentís', 'sienten'], 'e → ie · Lo siento. I\'m sorry.'),
    c('oír', 'to hear', 'presente', ['oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen'], 'oigo · i → y in oyes, oye, oyen'),
    c('ir / ser', 'to go / to be', 'pretérito (past)', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'], 'Same forms for both verbs. Fui al museo. I went to the museum.'),
    c('estar', 'to be', 'pretérito (past)', ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron'], 'Estuve en Madrid. I was in Madrid.'),
    c('tener', 'to have', 'pretérito (past)', ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron'], ''),
    c('hacer', 'to do, to make', 'pretérito (past)', ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron'], 'él form: hizo (c → z)'),
    c('poder', 'can, to be able to', 'pretérito (past)', ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron'], ''),
    c('poner', 'to put', 'pretérito (past)', ['puse', 'pusiste', 'puso', 'pusimos', 'pusisteis', 'pusieron'], ''),
    c('querer', 'to want', 'pretérito (past)', ['quise', 'quisiste', 'quiso', 'quisimos', 'quisisteis', 'quisieron'], ''),
    c('saber', 'to know', 'pretérito (past)', ['supe', 'supiste', 'supo', 'supimos', 'supisteis', 'supieron'], 'Supe = I found out'),
    c('venir', 'to come', 'pretérito (past)', ['vine', 'viniste', 'vino', 'vinimos', 'vinisteis', 'vinieron'], ''),
    c('decir', 'to say, to tell', 'pretérito (past)', ['dije', 'dijiste', 'dijo', 'dijimos', 'dijisteis', 'dijeron'], 'ellos form: dijeron (not dijieron)'),
    c('traer', 'to bring', 'pretérito (past)', ['traje', 'trajiste', 'trajo', 'trajimos', 'trajisteis', 'trajeron'], 'ellos form: trajeron'),
    c('dar', 'to give', 'pretérito (past)', ['di', 'diste', 'dio', 'dimos', 'disteis', 'dieron'], 'No accents on di / dio'),
    c('ver', 'to see', 'pretérito (past)', ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron'], 'No accents on vi / vio'),
    c('pedir', 'to order, to ask for', 'pretérito (past)', ['pedí', 'pediste', 'pidió', 'pedimos', 'pedisteis', 'pidieron'], 'e → i only in él and ellos'),
    c('dormir', 'to sleep', 'pretérito (past)', ['dormí', 'dormiste', 'durmió', 'dormimos', 'dormisteis', 'durmieron'], 'o → u only in él and ellos'),
  ],
};
