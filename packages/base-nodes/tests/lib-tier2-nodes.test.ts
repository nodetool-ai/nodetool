import { describe, it, expect } from "vitest";
import {
  TwilioSendSMSLibNode,
  TwilioSendWhatsAppLibNode,
  TwilioGetMessagesLibNode,
  TwilioLookupLibNode
} from "../src/nodes/lib-twilio.js";
import {
  NotionSearchLibNode,
  NotionGetPageLibNode,
  NotionGetPageContentLibNode,
  NotionCreatePageLibNode,
  NotionUpdatePageLibNode,
  NotionQueryDatabaseLibNode
} from "../src/nodes/lib-notion.js";
import {
  S3ListBucketsLibNode,
  S3ListObjectsLibNode,
  S3GetObjectLibNode,
  S3PutObjectLibNode,
  S3DeleteObjectLibNode,
  S3CopyObjectLibNode,
  S3GetPresignedUrlLibNode
} from "../src/nodes/lib-s3.js";
import {
  GraphQLQueryLibNode,
  GraphQLQueryWithAuthLibNode,
  GraphQLIntrospectionLibNode,
  GraphQLBatchQueryLibNode
} from "../src/nodes/lib-graphql.js";
import {
  SentimentAnalysisLibNode,
  TokenizeLibNode,
  StemLibNode,
  TfIdfLibNode,
  ClassifyTextLibNode,
  ExtractEntitiesLibNode,
  PhoneticMatchLibNode
} from "../src/nodes/lib-nlp.js";

// ---------------------------------------------------------------------------
// Twilio
// ---------------------------------------------------------------------------

describe("lib.twilio nodes", () => {
  it("TwilioSendSMSLibNode has correct metadata", () => {
    expect(TwilioSendSMSLibNode.nodeType).toBe("lib.twilio.SendSMS");
    expect(TwilioSendSMSLibNode.title).toBe("Send SMS");
  });

  it("TwilioSendWhatsAppLibNode has correct metadata", () => {
    expect(TwilioSendWhatsAppLibNode.nodeType).toBe("lib.twilio.SendWhatsApp");
    expect(TwilioSendWhatsAppLibNode.title).toBe("Send WhatsApp");
  });

  it("TwilioGetMessagesLibNode has correct metadata", () => {
    expect(TwilioGetMessagesLibNode.nodeType).toBe("lib.twilio.GetMessages");
    expect(TwilioGetMessagesLibNode.title).toBe("Get Messages");
  });

  it("TwilioLookupLibNode has correct metadata", () => {
    expect(TwilioLookupLibNode.nodeType).toBe("lib.twilio.Lookup");
    expect(TwilioLookupLibNode.title).toBe("Lookup Phone Number");
  });
});

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

describe("lib.notion nodes", () => {
  it("NotionSearchLibNode has correct metadata", () => {
    expect(NotionSearchLibNode.nodeType).toBe("lib.notion.Search");
    expect(NotionSearchLibNode.title).toBe("Notion Search");
  });

  it("NotionGetPageLibNode has correct metadata", () => {
    expect(NotionGetPageLibNode.nodeType).toBe("lib.notion.GetPage");
    expect(NotionGetPageLibNode.title).toBe("Notion Get Page");
  });

  it("NotionGetPageContentLibNode has correct metadata", () => {
    expect(NotionGetPageContentLibNode.nodeType).toBe(
      "lib.notion.GetPageContent"
    );
  });

  it("NotionCreatePageLibNode has correct metadata", () => {
    expect(NotionCreatePageLibNode.nodeType).toBe("lib.notion.CreatePage");
  });

  it("NotionUpdatePageLibNode has correct metadata", () => {
    expect(NotionUpdatePageLibNode.nodeType).toBe("lib.notion.UpdatePage");
  });

  it("NotionQueryDatabaseLibNode has correct metadata", () => {
    expect(NotionQueryDatabaseLibNode.nodeType).toBe(
      "lib.notion.QueryDatabase"
    );
  });
});

// ---------------------------------------------------------------------------
// S3
// ---------------------------------------------------------------------------

describe("lib.s3 nodes", () => {
  it("S3ListBucketsLibNode has correct metadata", () => {
    expect(S3ListBucketsLibNode.nodeType).toBe("lib.s3.ListBuckets");
    expect(S3ListBucketsLibNode.title).toBe("S3 List Buckets");
  });

  it("S3ListObjectsLibNode has correct metadata", () => {
    expect(S3ListObjectsLibNode.nodeType).toBe("lib.s3.ListObjects");
  });

  it("S3GetObjectLibNode has correct metadata", () => {
    expect(S3GetObjectLibNode.nodeType).toBe("lib.s3.GetObject");
  });

  it("S3PutObjectLibNode has correct metadata", () => {
    expect(S3PutObjectLibNode.nodeType).toBe("lib.s3.PutObject");
  });

  it("S3DeleteObjectLibNode has correct metadata", () => {
    expect(S3DeleteObjectLibNode.nodeType).toBe("lib.s3.DeleteObject");
  });

  it("S3CopyObjectLibNode has correct metadata", () => {
    expect(S3CopyObjectLibNode.nodeType).toBe("lib.s3.CopyObject");
  });

  it("S3GetPresignedUrlLibNode has correct metadata", () => {
    expect(S3GetPresignedUrlLibNode.nodeType).toBe("lib.s3.GetPresignedUrl");
  });
});

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

describe("lib.graphql nodes", () => {
  it("GraphQLQueryLibNode has correct metadata", () => {
    expect(GraphQLQueryLibNode.nodeType).toBe("lib.graphql.Query");
    expect(GraphQLQueryLibNode.title).toBe("GraphQL Query");
  });

  it("GraphQLQueryWithAuthLibNode has correct metadata", () => {
    expect(GraphQLQueryWithAuthLibNode.nodeType).toBe(
      "lib.graphql.QueryWithAuth"
    );
  });

  it("GraphQLIntrospectionLibNode has correct metadata", () => {
    expect(GraphQLIntrospectionLibNode.nodeType).toBe(
      "lib.graphql.Introspection"
    );
  });

  it("GraphQLBatchQueryLibNode has correct metadata", () => {
    expect(GraphQLBatchQueryLibNode.nodeType).toBe("lib.graphql.BatchQuery");
  });

  it("GraphQLQueryLibNode throws on empty URL", async () => {
    await expect(
      new GraphQLQueryLibNode({ url: "", query: "{ test }" }).process()
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NLP
// ---------------------------------------------------------------------------

describe("lib.nlp nodes", () => {
  it("SentimentAnalysisLibNode has correct metadata", () => {
    expect(SentimentAnalysisLibNode.nodeType).toBe("lib.nlp.SentimentAnalysis");
  });

  it("TokenizeLibNode has correct metadata", () => {
    expect(TokenizeLibNode.nodeType).toBe("lib.nlp.Tokenize");
  });

  it("StemLibNode has correct metadata", () => {
    expect(StemLibNode.nodeType).toBe("lib.nlp.Stem");
  });

  it("TfIdfLibNode has correct metadata", () => {
    expect(TfIdfLibNode.nodeType).toBe("lib.nlp.TfIdf");
  });

  it("ClassifyTextLibNode has correct metadata", () => {
    expect(ClassifyTextLibNode.nodeType).toBe("lib.nlp.ClassifyText");
  });

  it("ExtractEntitiesLibNode has correct metadata", () => {
    expect(ExtractEntitiesLibNode.nodeType).toBe("lib.nlp.ExtractEntities");
  });

  it("PhoneticMatchLibNode has correct metadata", () => {
    expect(PhoneticMatchLibNode.nodeType).toBe("lib.nlp.PhoneticMatch");
  });
});
