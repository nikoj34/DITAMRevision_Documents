/// <reference path="../pb_data/types.d.ts" />
// Création du schéma de l'application de revue de documents.
// Accès ouvert (intranet de confiance) ; pas de suppression hors admin :
// le cycle de vie passe par les statuts et l'archivage.

migrate(
  (app) => {
    const OPEN = { listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: null };

    // ── projects ──
    const projects = new Collection({
      ...OPEN,
      name: 'projects',
      type: 'base',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'code', type: 'text' },
        { name: 'description', type: 'text' },
        { name: 'client', type: 'text' },
        { name: 'with_moe', type: 'bool' },
        { name: 'archived', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(projects);

    // ── stakeholders (intervenants / profils) ──
    const stakeholders = new Collection({
      ...OPEN,
      name: 'stakeholders',
      type: 'base',
      fields: [
        { name: 'display_name', type: 'text', required: true },
        { name: 'organization', type: 'text' },
        {
          name: 'role',
          type: 'select',
          maxSelect: 1,
          values: [
            'MOA',
            'AMO_PROGRAMMISTE',
            'ARCHITECTE_MOE',
            'BET',
            'ECONOMISTE',
            'CONTROLEUR_TECHNIQUE',
            'EXPLOITANT',
            'SECRETAIRE',
            'AUTRE',
          ],
        },
        { name: 'specialty', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(stakeholders);

    // ── tags (lots, thèmes, locaux) ──
    const tags = new Collection({
      ...OPEN,
      name: 'tags',
      type: 'base',
      fields: [
        { name: 'project', type: 'relation', collectionId: projects.id, maxSelect: 1, required: true },
        { name: 'label', type: 'text', required: true },
        { name: 'kind', type: 'select', maxSelect: 1, values: ['lot', 'theme', 'local'] },
        { name: 'created', type: 'autodate', onCreate: true },
      ],
    });
    app.save(tags);

    // ── phases (APS1/APS2 = enregistrements distincts chaînés) ──
    const phases = new Collection({
      ...OPEN,
      name: 'phases',
      type: 'base',
      fields: [
        { name: 'project', type: 'relation', collectionId: projects.id, maxSelect: 1, required: true },
        {
          name: 'phase_type',
          type: 'select',
          maxSelect: 1,
          values: ['PROGRAMME', 'ESQ', 'APS', 'APD', 'PRO', 'DCE', 'ACT', 'EXE', 'AOR', 'AUTRE'],
        },
        { name: 'iteration', type: 'number' },
        { name: 'label', type: 'text', required: true },
        { name: 'status', type: 'select', maxSelect: 1, values: ['a_venir', 'en_cours', 'close'] },
        { name: 'start_date', type: 'date' },
        { name: 'end_date', type: 'date' },
        { name: 'sort_order', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(phases);

    // ── documents (document logique : "Plan RDC", "Notice CVC") ──
    const documents = new Collection({
      ...OPEN,
      name: 'documents',
      type: 'base',
      fields: [
        { name: 'phase', type: 'relation', collectionId: phases.id, maxSelect: 1, required: true },
        { name: 'title', type: 'text', required: true },
        { name: 'doc_code', type: 'text' },
        {
          name: 'category',
          type: 'select',
          maxSelect: 1,
          values: ['plan', 'notice', 'cctp', 'dpgf', 'estimation', 'planning', 'programme', 'cr', 'autre'],
        },
        { name: 'lot', type: 'relation', collectionId: tags.id, maxSelect: 1 },
        { name: 'archived', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(documents);

    // ── document_versions (indices A, B, C…) ──
    const versions = new Collection({
      ...OPEN,
      name: 'document_versions',
      type: 'base',
      fields: [
        { name: 'document', type: 'relation', collectionId: documents.id, maxSelect: 1, required: true },
        { name: 'index_label', type: 'text', required: true },
        { name: 'version_num', type: 'number', required: true },
        { name: 'file', type: 'file', maxSelect: 1, maxSize: 209715200 },
        { name: 'is_pdf', type: 'bool' },
        { name: 'uploaded_by', type: 'relation', collectionId: stakeholders.id, maxSelect: 1 },
        { name: 'issue_date', type: 'date' },
        { name: 'comment', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true },
      ],
    });
    app.save(versions);

    // ── remarks ──
    const remarks = new Collection({
      ...OPEN,
      name: 'remarks',
      type: 'base',
      fields: [
        { name: 'project', type: 'relation', collectionId: projects.id, maxSelect: 1, required: true },
        { name: 'number', type: 'number', required: true },
        { name: 'external_ref', type: 'text' },
        { name: 'document_version', type: 'relation', collectionId: versions.id, maxSelect: 1 },
        {
          name: 'anchor_kind',
          type: 'select',
          maxSelect: 1,
          values: ['epingle_pdf', 'zone_pdf', 'reference_texte', 'document_entier'],
        },
        { name: 'page', type: 'number' },
        { name: 'anchor_rect', type: 'json', maxSize: 2000 },
        { name: 'text_ref', type: 'text' },
        { name: 'body', type: 'text', required: true },
        {
          name: 'type',
          type: 'select',
          maxSelect: 1,
          values: ['observation', 'demande_modification', 'question', 'reserve', 'ecart_programme', 'suggestion'],
        },
        { name: 'criticity', type: 'select', maxSelect: 1, values: ['bloquante', 'importante', 'normale', 'mineure'] },
        { name: 'lot', type: 'relation', collectionId: tags.id, maxSelect: 1 },
        { name: 'themes', type: 'relation', collectionId: tags.id, maxSelect: 99 },
        {
          name: 'status',
          type: 'select',
          maxSelect: 1,
          values: ['a_traiter', 'en_cours', 'repondue', 'a_reverifier', 'traitee', 'sans_objet', 'reportee'],
        },
        {
          name: 'response_kind',
          type: 'select',
          maxSelect: 1,
          values: [
            'prise_en_compte',
            'prise_en_compte_partielle',
            'refusee',
            'demande_precision',
            'necessite_arbitrage',
            'hors_mission',
          ],
        },
        { name: 'author', type: 'relation', collectionId: stakeholders.id, maxSelect: 1, required: true },
        { name: 'assigned_to', type: 'relation', collectionId: stakeholders.id, maxSelect: 1 },
        { name: 'due_date', type: 'date' },
        { name: 'closed_at', type: 'date' },
        { name: 'closed_by', type: 'relation', collectionId: stakeholders.id, maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(remarks);

    // Auto-relation (remarque d'origine lors d'un report inter-versions) :
    // ajoutée après création car la collection doit exister pour être ciblée.
    const savedRemarks = app.findCollectionByNameOrId('remarks');
    savedRemarks.fields.add(
      new Field({ name: 'carried_from', type: 'relation', collectionId: savedRemarks.id, maxSelect: 1 })
    );
    app.save(savedRemarks);

    // ── remark_replies (fil de discussion) ──
    const replies = new Collection({
      ...OPEN,
      name: 'remark_replies',
      type: 'base',
      fields: [
        { name: 'remark', type: 'relation', collectionId: savedRemarks.id, maxSelect: 1, required: true, cascadeDelete: true },
        { name: 'author', type: 'relation', collectionId: stakeholders.id, maxSelect: 1, required: true },
        { name: 'body', type: 'text', required: true },
        { name: 'kind', type: 'select', maxSelect: 1, values: ['reponse', 'commentaire', 'changement_statut'] },
        { name: 'new_status', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true },
      ],
    });
    app.save(replies);

    // ── decisions (registre transverse aux phases) ──
    const decisions = new Collection({
      ...OPEN,
      name: 'decisions',
      type: 'base',
      fields: [
        { name: 'project', type: 'relation', collectionId: projects.id, maxSelect: 1, required: true },
        { name: 'number', type: 'number', required: true },
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'text' },
        {
          name: 'status',
          type: 'select',
          maxSelect: 1,
          values: ['a_arbitrer', 'actee', 'modifiee', 'reportee', 'abandonnee'],
        },
        { name: 'source_phase', type: 'relation', collectionId: phases.id, maxSelect: 1 },
        { name: 'source_remarks', type: 'relation', collectionId: savedRemarks.id, maxSelect: 99 },
        { name: 'decided_by', type: 'relation', collectionId: stakeholders.id, maxSelect: 1 },
        { name: 'decided_at', type: 'date' },
        { name: 'meeting_ref', type: 'text' },
        { name: 'themes', type: 'relation', collectionId: tags.id, maxSelect: 99 },
        { name: 'cost_impact', type: 'number' },
        { name: 'surface_impact', type: 'number' },
        // [{phase, phase_label, result: conforme|non_conforme|non_verifiable, by, date, note, remark}]
        { name: 'verifications', type: 'json', maxSize: 100000 },
        // [{date, old_status, new_status, by, note}]
        { name: 'history', type: 'json', maxSize: 100000 },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(decisions);

    // Auto-relation (décision qui remplace celle-ci quand statut = modifiée)
    const savedDecisions = app.findCollectionByNameOrId('decisions');
    savedDecisions.fields.add(
      new Field({ name: 'replaced_by', type: 'relation', collectionId: savedDecisions.id, maxSelect: 1 })
    );
    app.save(savedDecisions);
  },
  (app) => {
    for (const name of [
      'decisions',
      'remark_replies',
      'remarks',
      'document_versions',
      'documents',
      'phases',
      'tags',
      'stakeholders',
      'projects',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch {
        /* déjà supprimée */
      }
    }
  }
);
