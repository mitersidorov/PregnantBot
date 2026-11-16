import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCycleAndResultSchema1763210000000 implements MigrationInterface {
  name = 'CreateCycleAndResultSchema1763210000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE requirements (id char(36) NOT NULL PRIMARY KEY, name varchar(160) NOT NULL, description text NULL, patient_applicability varchar(20) NOT NULL DEFAULT 'both', cycle_day_hint int NULL, validity_days int NULL, active tinyint NOT NULL DEFAULT 1, version int NOT NULL DEFAULT 1) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE cycles (id char(36) NOT NULL PRIMARY KEY, started_by varchar(32) NOT NULL, start_date date NOT NULL, status varchar(20) NOT NULL DEFAULT 'active', created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX IDX_cycles_start_date (start_date)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE medical_files (id char(36) NOT NULL PRIMARY KEY, uploaded_by varchar(32) NOT NULL, object_key varchar(512) NOT NULL UNIQUE, original_name varchar(255) NOT NULL, content_type varchar(128) NOT NULL, byte_size int NOT NULL, uploaded_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE medical_results (id char(36) NOT NULL PRIMARY KEY, file_id char(36) NOT NULL, version_number int NOT NULL, test_name varchar(255) NULL, result_date date NULL, summary text NULL, interpretation_status varchar(20) NOT NULL DEFAULT 'proposed', model_version varchar(80) NULL, prompt_version varchar(40) NULL, schema_version varchar(40) NOT NULL DEFAULT '1', superseded_by char(36) NULL, INDEX IDX_results_file_version (file_id, version_number), CONSTRAINT FK_results_file FOREIGN KEY (file_id) REFERENCES medical_files(id) ON DELETE CASCADE) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE checklist_progress (cycle_id char(36) NOT NULL, requirement_id char(36) NOT NULL, status varchar(20) NOT NULL DEFAULT 'pending', result_id char(36) NULL, PRIMARY KEY (cycle_id, requirement_id), CONSTRAINT FK_progress_cycle FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE, CONSTRAINT FK_progress_requirement FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE RESTRICT, CONSTRAINT FK_progress_result FOREIGN KEY (result_id) REFERENCES medical_results(id) ON DELETE SET NULL) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE medical_result_requirements (result_id char(36) NOT NULL, requirement_id char(36) NOT NULL, PRIMARY KEY (result_id, requirement_id), CONSTRAINT FK_result_link_result FOREIGN KEY (result_id) REFERENCES medical_results(id) ON DELETE CASCADE, CONSTRAINT FK_result_link_requirement FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE RESTRICT) ENGINE=InnoDB`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE medical_result_requirements');
    await queryRunner.query('DROP TABLE checklist_progress');
    await queryRunner.query('DROP TABLE medical_results');
    await queryRunner.query('DROP TABLE medical_files');
    await queryRunner.query('DROP TABLE cycles');
    await queryRunner.query('DROP TABLE requirements');
  }
}
