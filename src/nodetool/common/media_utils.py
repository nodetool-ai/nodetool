import subprocess
import os

def get_media_duration(file_path):
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        file_path
    ]
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        output, errors = process.communicate(timeout=30)
        if process.returncode == 0:
            duration_str = output.strip()
            if duration_str != 'N/A':
                return float(duration_str)
        else:
            print(f"ffprobe error: {errors}")
    except subprocess.TimeoutExpired:
        print("ffprobe command timed out")
    except ValueError as e:
        print(f"Could not convert ffprobe output to float: {e}")
    except Exception as e:
        print(f"Error during ffprobe execution: {str(e)}")
    return None


import subprocess

def repackage_and_get_duration(source_path):
    # workaround to get duration from webm files
    repackaged_path = f"{source_path.rsplit('.', 1)[0]}_repackaged.webm"

    cmd_repackage = [
        'ffmpeg', '-i', source_path, '-c', 'copy', '-y', repackaged_path
    ]

    try:
        process = subprocess.Popen(cmd_repackage, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        _, errors = process.communicate(timeout=300)
        if process.returncode != 0:
            return None
        return get_media_duration(repackaged_path)
    except subprocess.TimeoutExpired:
        print("repackage asset: ffmpeg command timed out")
    except Exception as e:
        print(f"Error during ffmpeg execution: {str(e)}")
    finally:
        if os.path.exists(repackaged_path):
            os.remove(repackaged_path)
    return None
