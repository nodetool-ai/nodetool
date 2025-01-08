# nodetool.nodes.kling.api

## BaseRequest

**Fields:**

- **model** (typing.Optional[str])
- **callback_url** (typing.Optional[str])

## BaseResponse

**Fields:**

- **code** (int)
- **message** (str)
- **request_id** (str)

## ImageGenerationRequest

**Fields:**

- **model** (typing.Optional[str])
- **callback_url** (typing.Optional[str])
- **prompt** (str)
- **negative_prompt** (typing.Optional[str])
- **image** (typing.Optional[str])
- **image_fidelity** (typing.Optional[float])
- **n** (typing.Optional[int])
- **aspect_ratio** (typing.Optional[str])

## ImageResult

**Fields:**

- **index** (int)
- **url** (str)

## ImageToVideoRequest

**Fields:**

- **model** (typing.Optional[str])
- **callback_url** (typing.Optional[str])
- **image** (str)
- **image_tail** (typing.Optional[str])
- **prompt** (typing.Optional[str])
- **negative_prompt** (typing.Optional[str])
- **cfg_scale** (typing.Optional[float])
- **mode** (typing.Optional[str])
- **duration** (typing.Optional[str])

## TaskData

**Fields:**

- **task_id** (str)
- **task_status** (TaskStatus)
- **task_status_msg** (typing.Optional[str])
- **created_at** (int)
- **updated_at** (int)
- **task_result** (typing.Optional[nodetool.nodes.kling.api.TaskResult])

## TaskResponse

**Fields:**

- **code** (int)
- **message** (str)
- **request_id** (str)
- **data** (TaskData)

## TaskResult

**Fields:**

- **images** (typing.Optional[typing.List[nodetool.nodes.kling.api.ImageResult]])
- **videos** (typing.Optional[typing.List[nodetool.nodes.kling.api.VideoResult]])

## TaskStatus

## VideoGenerationRequest

**Fields:**

- **model** (typing.Optional[str])
- **callback_url** (typing.Optional[str])
- **prompt** (str)
- **negative_prompt** (typing.Optional[str])
- **cfg_scale** (typing.Optional[float])
- **mode** (typing.Optional[str])
- **camera_control** (typing.Optional[typing.Dict[str, typing.Any]])
- **aspect_ratio** (typing.Optional[str])
- **duration** (typing.Optional[str])

## VideoResult

**Fields:**

- **id** (str)
- **url** (str)
- **duration** (str)

## VirtualTryOnRequest

**Fields:**

- **model** (typing.Optional[str])
- **callback_url** (typing.Optional[str])
- **human_image** (str)
- **cloth_image** (typing.Optional[str])
