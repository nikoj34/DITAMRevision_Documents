/// <reference path="../pb_data/types.d.ts" />
// Référentiel d'exigences du programme : chaque exigence (surface, débit,
// équipement…) est un objet de référence vérifiable phase après phase,
// auquel on rattache les remarques. S'applique aussi aux bases existantes.

migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId('projects');
    const tags = app.findCollectionByNameOrId('tags');

    const requirements = new Collection({
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: null,
      name: 'requirements',
      type: 'base',
      fields: [
        { name: 'project', type: 'relation', collectionId: projects.id, maxSelect: 1, required: true },
        { name: 'code', type: 'text' }, // n° d'exigence du programme (ex. "EXG-2.014-03")
        { name: 'label', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'target_value', type: 'text' }, // valeur cible : "18 m²", "15 Pa", "500 kg/m²"…
        {
          name: 'origin',
          type: 'select',
          maxSelect: 1,
          // D'où vient l'exigence : programme, DSST (santé & sécurité au
          // travail), réglementation, sûreté, environnement…
          values: ['PROGRAMME', 'DSST', 'REGLEMENTATION', 'SURETE', 'ENVIRONNEMENT', 'EXPLOITATION', 'AUTRE'],
        },
        { name: 'source_ref', type: 'text' }, // chapitre / fiche espace / note DSST
        { name: 'themes', type: 'relation', collectionId: tags.id, maxSelect: 99 }, // sujets (locaux, thèmes)
        {
          name: 'status',
          type: 'select',
          maxSelect: 1,
          values: ['active', 'amendee', 'abandonnee'],
        },
        { name: 'status_note', type: 'text' }, // motif d'amendement/abandon, réf. de l'arbitrage
        // [{phase, phase_label, result: conforme|non_conforme|ecart_accepte|non_verifiable, by, by_name, date, note}]
        { name: 'verifications', type: 'json', maxSize: 100000 },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(requirements);

    // Rattachement des remarques aux exigences
    const remarks = app.findCollectionByNameOrId('remarks');
    const saved = app.findCollectionByNameOrId('requirements');
    remarks.fields.add(
      new Field({ name: 'requirements', type: 'relation', collectionId: saved.id, maxSelect: 99 })
    );
    app.save(remarks);
  },
  (app) => {
    const remarks = app.findCollectionByNameOrId('remarks');
    remarks.fields.removeByName('requirements');
    app.save(remarks);
    app.delete(app.findCollectionByNameOrId('requirements'));
  }
);
