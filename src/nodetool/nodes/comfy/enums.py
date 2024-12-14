import enum


class Scheduler(str, enum.Enum):
    normal = "normal"
    karras = "karras"
    exponential = "exponential"
    sgm_uniform = "sgm_uniform"
    simple = "simple"
    ddim_uniform = "ddim_uniform"
    beta = "beta"
    linear_quadratic = "linear_quadratic"


class Sampler(str, enum.Enum):
    ddim = "ddim"
    ddpm = "ddpm"
    dpm_2 = "dpm_2"
    dpm_2_ancestral = "dpm_2_ancestral"
    dpm_adaptive = "dpm_adaptive"
    dpm_fast = "dpm_fast"
    dpmpp_2m = "dpmpp_2m"
    dpmpp_2m_sde = "dpmpp_2m_sde"
    dpmpp_2m_sde_gpu = "dpmpp_2m_sde_gpu"
    dpmpp_2s_ancestral = "dpmpp_2s_ancestral"
    dpmpp_3m_sde = "dpmpp_3m_sde"
    dpmpp_3m_sde_gpu = "dpmpp_3m_sde_gpu"
    dpmpp_sde = "dpmpp_sde"
    dpmpp_sde_gpu = "dpmpp_sde_gpu"
    euler = "euler"
    euler_ancestral = "euler_ancestral"
    heun = "heun"
    heunpp2 = "heunpp2"
    lcm = "lcm"
    lms = "lms"
    uni_pc = "uni_pc"
    uni_pc_bh2 = "uni_pc_bh2"
