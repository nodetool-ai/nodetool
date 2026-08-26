# HappyHorse - reference-to-video

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: HappyHorse - reference-to-video
      deprecated: false
      description: >-
        ## Query Task Status


        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          Learn how to query task status and retrieve generation results
        </Card>


        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Market Overview" icon="lucide-store" href="/market/quickstart">
            Explore all available models
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check credits and account usage
          </Card>
        </CardGroup>
      operationId: happyhorse-reference-to-video
      tags:
        - docs/en/Market/Video Models/HappyHorse
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `happyhorse/reference-to-video` for this endpoint
                  enum:
                    - happyhorse/reference-to-video
                  default: happyhorse/reference-to-video
                  x-apidog-enum:
                    - value: happyhorse/reference-to-video
                      name: ''
                      description: ''
                  examples:
                    - happyhorse/reference-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.


                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        Text prompt describing the video to generate (any
                        language). Max 5,000 non‑Chinese characters or 2,500
                        Chinese characters; extra content is truncated.
                      maxLength: 5000
                      examples:
                        - >-
                          A woman in a red qipao character1. The shot opens with
                          a side medium view outlining the tailored fit of the
                          qipao and S-curve silhouette, then cuts to a low-angle
                          shot capturing her gracefully unfolding a folding fan
                          character2, with tassel earrings character3 swaying
                          lightly as she turns her head. Finally, the camera
                          pushes into a facial close-up, freezing on her
                          fingertips lightly touching the fan ribs and the
                          subtle, reserved charm in her expressive gaze. Through
                          multiple angles, it comprehensively showcases an aura
                          of Eastern elegance.
                    reference_image:
                      type: array
                      items:
                        type: string
                      description: >-
                        Reference image URL list. Provide 1–9 images. The order
                        defines which image is character1, character2, etc.


                        Image limits:

                        Format: JPEG, JPG, PNG, and WEBP.

                        Resolution: shortest side at least 400 px. 720P or
                        higher recommended. Avoid small, blurry, or heavily
                        compressed images, as they degrade output quality.

                        File size: 10 MB maximum.
                      maxItems: 9
                      minItems: 1
                    resolution:
                      type: string
                      description: >-
                        Output video resolution. Valid values: 720P, 1080P
                        (default).
                      enum:
                        - 720p
                        - 1080p
                      default: 1080p
                      x-apidog-enum:
                        - value: 720p
                          name: ''
                          description: ''
                        - value: 1080p
                          name: ''
                          description: ''
                      examples:
                        - 1080p
                    aspect_ratio:
                      type: string
                      description: >-
                        Output aspect ratio. Valid values: 16:9 (default), 9:16,
                        1:1, 4:3, 3:4.
                      enum:
                        - '16:9'
                        - '9:16'
                        - '1:1'
                        - '4:3'
                        - '3:4'
                      x-apidog-enum:
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '1:1'
                          name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                      default: '16:9'
                      examples:
                        - '16:9'
                    duration:
                      type: integer
                      description: >-
                        Output duration in seconds (integer). Must be between 3
                        and 15. Defaults to 5.
                      default: 5
                      examples:
                        - 5
                      minimum: 3
                      maximum: 15
                    seed:
                      type: integer
                      description: Random seed for reproducibility (if supported).
                      default: 0
                      minimum: 0
                      maximum: 2147483647
                  x-apidog-orders:
                    - prompt
                    - reference_image
                    - resolution
                    - aspect_ratio
                    - duration
                    - seed
                  required:
                    - prompt
                    - reference_image
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              x-apidog-ignore-properties: []
            example:
              model: happyhorse/reference-to-video
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A woman in a red qipao character1. The shot opens with a side
                  medium view outlining the tailored fit of the qipao and
                  S-curve silhouette, then cuts to a low-angle shot capturing
                  her gracefully unfolding a folding fan character2, with tassel
                  earrings character3 swaying lightly as she turns her head.
                  Finally, the camera pushes into a facial close-up, freezing on
                  her fingertips lightly touching the fan ribs and the subtle,
                  reserved charm in her expressive gaze. Through multiple
                  angles, it comprehensively showcases an aura of Eastern
                  elegance.
                reference_image:
                  - https://loremflickr.com/400/400?lock=8132663902229376
                  - https://loremflickr.com/400/400?lock=1716016437146867
                resolution: 1080p
                aspect_ratio: '16:9'
                duration: 5
                seed: 1308038620
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
              example:
                code: 200
                msg: success
                data:
                  taskId: task_bytedance_1765186743319
          headers: {}
          x-apidog-name: ''
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        videoTaskCompleted:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                The system sends this callback when the
                `happyhorse/reference-to-video` task succeeds or fails.
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      type: object
                      required:
                        - code
                        - msg
                        - data
                      properties:
                        code:
                          type: integer
                          description: >-
                            Unified callback code: 200 for success, 501 for
                            failure.
                          enum:
                            - 200
                            - 501
                        msg:
                          type: string
                          description: Unified callback message.
                          enum:
                            - Playground task completed successfully.
                            - Playground task failed.
                        data:
                          type: object
                          required:
                            - taskId
                            - model
                            - state
                            - param
                            - resultJson
                            - failCode
                            - failMsg
                          properties:
                            taskId:
                              type: string
                              description: The unique task identifier.
                            model:
                              type: string
                              description: The model used for the task.
                              enum:
                                - happyhorse/reference-to-video
                            state:
                              type: string
                              description: Terminal task state.
                              enum:
                                - success
                                - fail
                            param:
                              type: string
                              description: >-
                                JSON string containing the submitted task
                                parameters.
                            resultJson:
                              type: string
                              nullable: true
                              description: >-
                                JSON string containing resultUrls,
                                firstFrameUrl, lastFrameUrl, or resultObject
                                when successful. Null when failed.
                            failCode:
                              type: string
                              nullable: true
                              description: Null when successful; failure code when failed.
                            failMsg:
                              type: string
                              nullable: true
                              description: >-
                                Null when successful; failure message when
                                failed.
                            costTime:
                              type: integer
                              format: int64
                              description: >-
                                Task processing time. Present on successful
                                callbacks.
                            completeTime:
                              type: integer
                              format: int64
                              description: Task completion timestamp.
                            createTime:
                              type: integer
                              format: int64
                              description: Task creation timestamp.
                            updateTime:
                              type: integer
                              format: int64
                              description: Task update timestamp.
                            creditsConsumed:
                              type: number
                              description: >-
                                Credits consumed by the task. Present on
                                successful callbacks.
                    examples:
                      success:
                        summary: Task completed successfully
                        value:
                          code: 200
                          msg: Playground task completed successfully.
                          data:
                            taskId: task_example_video_webhook_001
                            model: happyhorse/reference-to-video
                            state: success
                            param: >-
                              {"input":"{\"prompt\":\"A woman in a red qipao
                              character1. The shot opens with a side medium view
                              outlining the tailored fit of the qipao
                              and...\",\"reference_image\":[\"https://example.com/input-image.jpg\"],\"resolution\":\"1080p\",\"aspect_ratio\":\"16:9\",\"duration\":5,\"seed\":1308038620}","callBackUrl":"https://example.com/callback","model":"happyhorse/reference-to-video"}
                            resultJson: >-
                              {"resultUrls":["https://example.com/generated-video.mp4"]}
                            failCode: null
                            failMsg: null
                            costTime: 12
                            completeTime: 1234567890
                            createTime: 1234560000
                            updateTime: 1234567890
                            creditsConsumed: 1.23
                      failure:
                        summary: Task failed
                        value:
                          code: 501
                          msg: Playground task failed.
                          data:
                            taskId: task_example_video_webhook_001
                            model: happyhorse/reference-to-video
                            state: fail
                            param: >-
                              {"input":"{\"prompt\":\"A woman in a red qipao
                              character1. The shot opens with a side medium view
                              outlining the tailored fit of the qipao
                              and...\",\"reference_image\":[\"https://example.com/input-image.jpg\"],\"resolution\":\"1080p\",\"aspect_ratio\":\"16:9\",\"duration\":5,\"seed\":1308038620}","callBackUrl":"https://example.com/callback","model":"happyhorse/reference-to-video"}
                            failCode: GENERATION_FAILED
                            failMsg: The generation task failed.
              responses:
                '200':
                  description: Callback received successfully.
                  content:
                    application/json:
                      schema:
                        type: object
                        properties:
                          code:
                            type: integer
                            example: 200
                          msg:
                            type: string
                            example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Video Models/HappyHorse
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-34249818-run
components:
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          description: >-
            Response status code


            - **200**: Success - Request has been processed successfully

            - **401**: Unauthorized - Authentication credentials are missing or
            invalid

            - **402**: Insufficient Credits - Account does not have enough
            credits to perform the operation

            - **404**: Not Found - The requested resource or endpoint does not
            exist

            - **422**: Validation Error - The request parameters failed
            validation checks

            - **429**: Rate Limited - Request limit has been exceeded for this
            resource

            - **433**: Request Limit - Sub-key Usage Exceeds Limit

            - **455**: Service Unavailable - System is currently undergoing
            maintenance

            - **500**: Server Error - An unexpected error occurred while
            processing the request

            - **501**: Generation Failed - Content generation task failed

            - **505**: Feature Disabled - The requested feature is currently
            disabled
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 433
            - 455
            - 500
            - 501
            - 505
          x-apidog-enum:
            - value: 200
              name: ''
              description: ''
            - value: 401
              name: ''
              description: ''
            - value: 402
              name: ''
              description: ''
            - value: 404
              name: ''
              description: ''
            - value: 422
              name: ''
              description: ''
            - value: 429
              name: ''
              description: ''
            - value: 433
              name: ''
              description: ''
            - value: 455
              name: ''
              description: ''
            - value: 500
              name: ''
              description: ''
            - value: 501
              name: ''
              description: ''
            - value: 505
              name: ''
              description: ''
        msg:
          type: string
          description: Response message, error description when failed
          examples:
            - success
        data:
          type: object
          properties:
            taskId:
              type: string
              description: >-
                Task ID, can be used with Get Task Details endpoint to query
                task status
          x-apidog-orders:
            - taskId
          required:
            - taskId
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - code
        - msg
        - data
      title: response not with recordId
      required:
        - data
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        All API requests require a Bearer Token. Add the header `Authorization:
        Bearer YOUR_API_KEY` to authenticate requests.
    BearerAuth1:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        所有 API 请求都需要 Bearer Token。请在请求头中添加 `Authorization: Bearer YOUR_API_KEY`
        进行身份验证。
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```
