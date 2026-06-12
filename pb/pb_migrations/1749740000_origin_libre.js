/// <reference path="../pb_data/types.d.ts" />
// L'origine d'une exigence devient un texte libre (avec suggestions côté
// interface) : programme, DSST, équipe de recherche, réglementation… —
// la liste fermée ne couvrait pas tous les émetteurs d'exigences.

migrate(
  (app) => {
    const req = app.findCollectionByNameOrId('requirements');
    req.fields.removeByName('origin');
    app.save(req);

    const req2 = app.findCollectionByNameOrId('requirements');
    req2.fields.add(new Field({ name: 'origin', type: 'text' }));
    app.save(req2);
  },
  (app) => {
    const req = app.findCollectionByNameOrId('requirements');
    req.fields.removeByName('origin');
    app.save(req);

    const req2 = app.findCollectionByNameOrId('requirements');
    req2.fields.add(
      new Field({
        name: 'origin',
        type: 'select',
        maxSelect: 1,
        values: ['PROGRAMME', 'DSST', 'REGLEMENTATION', 'SURETE', 'ENVIRONNEMENT', 'EXPLOITATION', 'AUTRE'],
      })
    );
    app.save(req2);
  }
);
