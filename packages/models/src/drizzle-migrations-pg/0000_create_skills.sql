CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_skills_user" ON "skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_skills_user_name" ON "skills" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skills_user_name_unique" ON "skills" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "idx_skills_updated" ON "skills" USING btree ("updated_at");
