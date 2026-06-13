/// <reference path="../pb_data/types.d.ts" />
// Durcissement intégrité & sécurité (audit) :
//  - index UNIQUE (project, number) sur remarks et decisions : empêche deux
//    créations concurrentes d'obtenir le même numéro (le client rejoue alors
//    avec le numéro suivant).
//  - numéro minimal = 1.
//  - restriction des types de fichiers déposés + taille max raisonnable.

migrate(
  (app) => {
    // ── remarks : numéro unique par projet, min 1 ──
    const remarks = app.findCollectionByNameOrId('remarks');
    const rNum = remarks.fields.getByName('number');
    rNum.min = 1;
    remarks.indexes = [
      ...remarks.indexes,
      'CREATE UNIQUE INDEX `idx_remarks_project_number` ON `remarks` (`project`, `number`)',
    ];
    app.save(remarks);

    // ── decisions : numéro unique par projet, min 1 ──
    const decisions = app.findCollectionByNameOrId('decisions');
    const dNum = decisions.fields.getByName('number');
    dNum.min = 1;
    decisions.indexes = [
      ...decisions.indexes,
      'CREATE UNIQUE INDEX `idx_decisions_project_number` ON `decisions` (`project`, `number`)',
    ];
    app.save(decisions);

    // ── document_versions : types autorisés + taille max 60 Mo ──
    const versions = app.findCollectionByNameOrId('document_versions');
    const file = versions.fields.getByName('file');
    file.maxSize = 62914560; // 60 Mo
    file.mimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'text/csv',
    ];
    app.save(versions);
  },
  (app) => {
    const remarks = app.findCollectionByNameOrId('remarks');
    remarks.indexes = remarks.indexes.filter((i) => !i.includes('idx_remarks_project_number'));
    app.save(remarks);

    const decisions = app.findCollectionByNameOrId('decisions');
    decisions.indexes = decisions.indexes.filter((i) => !i.includes('idx_decisions_project_number'));
    app.save(decisions);

    const versions = app.findCollectionByNameOrId('document_versions');
    const file = versions.fields.getByName('file');
    file.mimeTypes = [];
    file.maxSize = 209715200;
    app.save(versions);
  }
);
