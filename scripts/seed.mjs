// Données de démonstration : node scripts/seed.mjs [URL PocketBase]
// Crée une opération exemple avec phases, intervenants, lots, documents
// (PDF de démonstration), remarques, réponses et décisions.

import PocketBase from 'pocketbase';

const url = process.argv[2] || 'http://127.0.0.1:8090';
const pb = new PocketBase(url);
pb.autoCancellation(false);

// PDF minimal d'une page (A4) valide, généré à la main.
function tinyPdf(title) {
  const content = `BT /F1 24 Tf 60 770 Td (${title}) Tj ET\nBT /F1 12 Tf 60 740 Td (Document de demonstration - revue de documents) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${content.length} >> stream
${content}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R /Size 6 >>
%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

async function main() {
  console.log(`Seed vers ${url}…`);

  const people = {};
  for (const [name, organization, role, specialty] of [
    ['Nicolas Jamet', 'CIRAD', 'MOA', ''],
    ['Claire Morel', 'Atelier CM Architectes', 'ARCHITECTE_MOE', ''],
    ['Karim Benali', 'BET Fluidexpert', 'BET', 'Fluides'],
    ['Sophie Leroy', 'Économie & Construction', 'ECONOMISTE', ''],
    ['Marc Dupuis', 'Socotec', 'CONTROLEUR_TECHNIQUE', ''],
    ['Awa Diallo', 'CIRAD — Services techniques', 'EXPLOITANT', 'Maintenance'],
  ]) {
    people[name] = await pb.collection('stakeholders').create({
      display_name: name,
      organization,
      role,
      specialty,
      active: true,
    });
  }

  const project = await pb.collection('projects').create({
    name: 'Bâtiment de laboratoires L2 — Démo',
    code: 'OP-DEMO-01',
    client: 'CIRAD',
    with_moe: true,
    archived: false,
  });

  const phaseDefs = [
    ['PROGRAMME', 'Programme', 'close'],
    ['ESQ', 'ESQ', 'close'],
    ['APS', 'APS1', 'close'],
    ['APS', 'APS2', 'close'],
    ['APD', 'APD', 'en_cours'],
    ['PRO', 'PRO', 'a_venir'],
    ['DCE', 'DCE', 'a_venir'],
  ];
  const phases = [];
  for (let i = 0; i < phaseDefs.length; i++) {
    const [phase_type, label, status] = phaseDefs[i];
    phases.push(
      await pb.collection('phases').create({
        project: project.id,
        phase_type,
        iteration: label === 'APS2' ? 2 : 1,
        label,
        status,
        sort_order: i,
      })
    );
  }
  const aps2 = phases[3];
  const apd = phases[4];

  const lots = {};
  for (const label of ['Lot 02 – Gros œuvre', 'Lot 08 – CVC', 'Lot 12 – Électricité', 'Architecture']) {
    lots[label] = await pb.collection('tags').create({ project: project.id, label, kind: 'lot' });
  }
  for (const label of ['Accessibilité', 'Surfaces', 'Exploitation-maintenance']) {
    await pb.collection('tags').create({ project: project.id, label, kind: 'theme' });
  }

  async function makeDoc(phase, title, doc_code, category, lot, indices) {
    const doc = await pb.collection('documents').create({
      phase: phase.id,
      title,
      doc_code,
      category,
      lot: lot ? lots[lot].id : null,
      archived: false,
    });
    const versions = [];
    for (let i = 0; i < indices.length; i++) {
      const fd = new FormData();
      fd.set('document', doc.id);
      fd.set('index_label', indices[i]);
      fd.set('version_num', String(i + 1));
      fd.set('file', tinyPdf(`${title} - indice ${indices[i]}`), `${doc_code || title}-${indices[i]}.pdf`);
      fd.set('is_pdf', 'true');
      fd.set('uploaded_by', people['Claire Morel'].id);
      fd.set('issue_date', new Date().toISOString());
      versions.push(await pb.collection('document_versions').create(fd));
    }
    return { doc, versions };
  }

  const planRdc = await makeDoc(apd, 'Plan RDC', 'APD-ARC-PLN-100', 'plan', 'Architecture', ['A', 'B']);
  const noticeCvc = await makeDoc(apd, 'Notice CVC', 'APD-CVC-NOT-001', 'notice', 'Lot 08 – CVC', ['A']);
  await makeDoc(aps2, 'Plan masse APS2', 'APS2-ARC-PLN-001', 'plan', 'Architecture', ['A']);

  let num = 0;
  async function remark(data) {
    num += 1;
    return pb.collection('remarks').create({ project: project.id, number: num, ...data });
  }

  const r1 = await remark({
    document_version: planRdc.versions[1].id,
    anchor_kind: 'epingle_pdf',
    page: 1,
    anchor_rect: { x: 0.35, y: 0.3, w: 0, h: 0 },
    body: 'La largeur du dégagement devant le local 1.012 semble inférieure à 1,40 m — à vérifier au regard de l’effectif.',
    type: 'reserve',
    criticity: 'bloquante',
    lot: lots['Architecture'].id,
    status: 'a_traiter',
    author: people['Marc Dupuis'].id,
    assigned_to: people['Claire Morel'].id,
    due_date: new Date(Date.now() - 5 * 864e5).toISOString(),
    text_ref: 'Local 1.012',
  });
  await remark({
    document_version: planRdc.versions[1].id,
    anchor_kind: 'zone_pdf',
    page: 1,
    anchor_rect: { x: 0.55, y: 0.45, w: 0.18, h: 0.12 },
    body: 'Prévoir un point d’eau dans la laverie (demande actée en APS2, CR n°8).',
    type: 'demande_modification',
    criticity: 'importante',
    lot: lots['Architecture'].id,
    status: 'repondue',
    response_kind: 'prise_en_compte',
    author: people['Awa Diallo'].id,
    text_ref: 'Local 2.014 — Laverie',
  });
  await remark({
    document_version: noticeCvc.versions[0].id,
    anchor_kind: 'reference_texte',
    page: 1,
    body: 'Le débit hygiénique retenu (§2.1) ne couvre pas l’occupation maximale des salles de réunion.',
    type: 'question',
    criticity: 'normale',
    lot: lots['Lot 08 – CVC'].id,
    status: 'a_traiter',
    author: people['Karim Benali'].id,
    text_ref: 'NDC CVC §2.1 — débits hygiéniques',
  });

  await pb.collection('remark_replies').create({
    remark: r1.id,
    author: people['Claire Morel'].id,
    kind: 'reponse',
    body: 'Le dégagement sera porté à 1,40 m sur l’indice C (décalage de la cloison du local 1.012).',
  });

  await pb.collection('decisions').create({
    project: project.id,
    number: 1,
    title: 'Suppression de la 2e cage d’escalier aile B ; évacuation par l’escalier 1 élargi à 1,40 m',
    body: 'Décision prise pour tenir l’enveloppe budgétaire. L’escalier 1 est redimensionné en conséquence.',
    status: 'actee',
    source_phase: aps2.id,
    decided_by: people['Nicolas Jamet'].id,
    decided_at: new Date(Date.now() - 90 * 864e5).toISOString(),
    meeting_ref: 'CR réunion MOE n°8 du 12/03/2026',
    verifications: [],
    history: [
      {
        date: new Date(Date.now() - 90 * 864e5).toISOString(),
        old_status: '',
        new_status: 'actee',
        by_name: 'Nicolas Jamet',
        note: 'Arbitrage budgétaire APS2',
      },
    ],
  });
  await pb.collection('decisions').create({
    project: project.id,
    number: 2,
    title: 'Mutualisation des deux salles de réunion du R+1',
    body: 'Proposition MOE pour gagner 28 m² SU — en attente d’arbitrage MOA.',
    status: 'a_arbitrer',
    source_phase: apd.id,
    surface_impact: -28,
    history: [],
  });

  console.log('✅ Données de démonstration créées :');
  console.log(`   Projet « ${project.name} » (${phases.length} phases, ${num} remarques, 2 décisions)`);
}

main().catch((e) => {
  console.error('Échec du seed :', e?.response || e);
  process.exit(1);
});
