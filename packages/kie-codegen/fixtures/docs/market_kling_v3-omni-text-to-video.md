# Kling 3.0 Omni Text to Video

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
      summary: Kling 3.0 Omni Text to Video
      deprecated: false
      description: >-
        ## Query Task Status


        After submitting a task, you can check the task progress and retrieve
        generation results via the unified query endpoint:


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          Learn how to query task status and obtain generation results
        </Card>


        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Market Overview" icon="lucide-store" href="/market/quickstart">
            Browse all available models
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check account credits and usage status
          </Card>
        </CardGroup>
      operationId: kling-3.0-omni-text-to-video
      tags:
        - docs/en/Market/Video Models/Kling
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
                  enum:
                    - kling-3.0-omni/text-to-video
                  default: kling-3.0-omni/text-to-video
                  description: >-
                    The name of the model used to generate the task. This field
                    is required.


                    - This endpoint requires the `kling-3.0-omni/text-to-video`
                    model
                  examples:
                    - kling-3.0-omni/text-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The callback URL that receives a notification when the
                    generation task is complete. This configuration is optional
                    but recommended for production environments.


                    - After the generation task is complete, the system sends
                    the task status and result to this URL via POST.

                    - The callback payload includes the URL of the generated
                    content and other task-related information.

                    - Your callback endpoint must support POST requests with a
                    JSON request body.

                    - Alternatively, you can call the task details endpoint to
                    poll the task status proactively.

                    - To secure your callback requests, see the [Webhook
                    Verification Guide](/cn/common-api/webhook-verification) for
                    instructions on implementing signature verification.
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameter configuration for the generation task.
                  required:
                    - prompt
                  properties:
                    prompt:
                      type: string
                      description: >-
                        Text description of the video. It must not be empty
                        after leading and trailing whitespace is removed, and
                        must not exceed 3,072 characters.
                      minLength: 1
                      maxLength: 3072
                    customize_multi_shots:
                      type: boolean
                      description: >-
                        Whether to enable multi-shot mode. Explicitly specifying
                        this value is recommended. `true` enables multiple
                        shots; `false` uses a single shot.
                      default: true
                      examples:
                        - true
                    prefer_multi_shots:
                      type: boolean
                      description: >-
                        Whether to enable intelligent shot planning. This field
                        is mutually exclusive with `customize_multi_shots`.


                        Both fields may be `false`, but they cannot both be
                        `true`.
                      examples:
                        - true
                    multi_prompt:
                      type: array
                      description: >-
                        List of custom shots. When `customize_multi_shots` is
                        `true`, this field is required, must not be empty, and
                        supports up to 6 shots. When `customize_multi_shots` is
                        `false`, it must be an empty array or omitted.
                      maxItems: 6
                      default: []
                      items:
                        type: object
                        required:
                          - prompt
                          - duration
                        properties:
                          prompt:
                            type: string
                            description: >-
                              Video description for the current shot. Maximum
                              length: 512 characters.
                            minLength: 1
                            maxLength: 512
                            examples:
                              - >-
                                A wide shot of the fox entering the snowy
                                forest.
                          duration:
                            type: integer
                            description: >-
                              Duration of the current shot in seconds. The
                              supported range is 1 to 15 seconds.
                            minimum: 1
                            maximum: 15
                            examples:
                              - 2
                        x-apidog-orders:
                          - prompt
                          - duration
                        x-apidog-ignore-properties: []
                      examples:
                        - - prompt: A wide shot of the fox entering the snowy forest.
                            duration: 2
                          - prompt: >-
                              A cinematic close-up of the fox looking toward the
                              sunrise.
                            duration: 3
                    elements:
                      type: array
                      items:
                        type: object
                        required:
                          - name
                          - description
                          - element_input_urls
                        properties:
                          name:
                            type: string
                            description: >-
                              Subject name. It must be unique within the same
                              request and can be referenced in the `prompt`
                              field using `@name`.
                            minLength: 1
                            examples:
                              - element_dog
                          description:
                            type: string
                            description: Text description of the subject asset.
                            minLength: 1
                            examples:
                              - A happy golden retriever
                          element_input_urls:
                            type: array
                            description: >-
                              List of image URLs for a multi-image subject
                              (provide 2 to 4 images), or a video URL for a
                              video character subject (provide exactly 1 video).
                              Images and videos cannot be mixed. HTTP, HTTPS,
                              and OSS URLs are supported.
                            minItems: 1
                            maxItems: 4
                            items:
                              type: string
                              format: uri
                              pattern: ^(https?|oss)://
                            examples:
                              - - https://example.com/dog-front.png
                                - https://example.com/dog-side.png
                          element_input_audio_urls:
                            type: array
                            description: >-
                              Optional list of subject audio asset URLs. HTTP,
                              HTTPS, and OSS URLs are supported.
                            default: []
                            items:
                              type: string
                              format: uri
                              pattern: ^(https?|oss)://
                            examples:
                              - []
                        x-apidog-orders:
                          - name
                          - description
                          - element_input_urls
                          - element_input_audio_urls
                        x-apidog-ignore-properties: []
                      description: >-
                        List of one-time subject assets. The default is an empty
                        array.

                        When using only multi-image subjects, up to 7 subjects
                        can be uploaded.

                        When using only video character subjects, the number of
                        video character subjects must not exceed 3.

                        When using both video character and multi-image
                        subjects, the number of video character subjects must
                        not exceed 3, and the number of multi-image subjects
                        must not exceed 4.
                      default: []
                    audio:
                      type: boolean
                      description: >-
                        Whether to add audio to the generated video. `true`
                        enables audio; `false` disables audio.
                      default: false
                      examples:
                        - false
                    resolution:
                      type: string
                      description: >-
                        Resolution of the generated video. Available values are
                        `720p` (outputs a 720p video), `1080p` (outputs a 1080p
                        video), and `4k` (outputs a 4K video).
                      enum:
                        - 720p
                        - 1080p
                        - 4k
                      default: 720p
                      x-apidog-enum:
                        - value: 720p
                          name: ''
                          description: ''
                        - value: 1080p
                          name: ''
                          description: ''
                        - value: 4k
                          name: ''
                          description: ''
                      examples:
                        - 720p
                    aspect_ratio:
                      type: string
                      description: >-
                        Aspect ratio of the generated video. Supported values
                        are `16:9`, `9:16`, and `1:1`.
                      enum:
                        - '16:9'
                        - '9:16'
                        - '1:1'
                      default: '16:9'
                      examples:
                        - '16:9'
                    duration:
                      type: integer
                      description: >-
                        Total video duration in seconds. The supported range is
                        3 to 15 seconds, and the default is 5 seconds.
                      enum:
                        - 3
                        - 4
                        - 5
                        - 6
                        - 7
                        - 8
                        - 9
                        - 10
                        - 11
                        - 12
                        - 13
                        - 14
                        - 15
                      default: 5
                      minimum: 3
                      maximum: 15
                      examples:
                        - 5
                  allOf:
                    - type: string
                    - type: string
                    - type: string
                    - type: string
                  x-apidog-orders:
                    - prompt
                    - customize_multi_shots
                    - prefer_multi_shots
                    - multi_prompt
                    - elements
                    - audio
                    - resolution
                    - aspect_ratio
                    - duration
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              examples:
                - model: kling-3.0-omni/text-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: A wide shot of the fox entering the snowy forest.
                    customize_multi_shots: true
                    multi_prompt:
                      - prompt: A wide shot of the fox entering the snowy forest.
                        duration: 2
                      - prompt: >-
                          A cinematic close-up of the fox looking toward the
                          sunrise.
                        duration: 3
                    audio: false
                    resolution: 720p
                    aspect_ratio: '16:9'
                    duration: 5
              x-apidog-ignore-properties: []
            examples: {}
      responses:
        '200':
          description: Request Successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
              example:
                code: 200
                msg: success
                data:
                  taskId: task_kling-2.6_1765182425861
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
                `kling-2.6/text-to-video` task succeeds or fails.
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
                                - kling-2.6/text-to-video
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
                            model: kling-2.6/text-to-video
                            state: success
                            param: >-
                              {"input":"{\"prompt\":\"Scene: A fashion
                              live-streaming sales setting, with clothes hanging
                              on racks and the host's figure reflected in a
                              ful...\",\"sound\":false,\"aspect_ratio\":\"1:1\",\"duration\":\"5\"}","callBackUrl":"https://example.com/callback","model":"kling-2.6/text-to-video"}
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
                            model: kling-2.6/text-to-video
                            state: fail
                            param: >-
                              {"input":"{\"prompt\":\"Scene: A fashion
                              live-streaming sales setting, with clothes hanging
                              on racks and the host's figure reflected in a
                              ful...\",\"sound\":false,\"aspect_ratio\":\"1:1\",\"duration\":\"5\"}","callBackUrl":"https://example.com/callback","model":"kling-2.6/text-to-video"}
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
      x-apidog-folder: docs/en/Market/Video Models/Kling
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-41795696-run
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
