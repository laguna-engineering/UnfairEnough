package expo.modules.tvsplashscreen

import android.app.Activity
import android.graphics.Color
import android.view.ViewGroup
import android.view.animation.AlphaAnimation
import android.widget.FrameLayout
import android.widget.ImageView

object TvSplashScreenManager {
  private var overlay: FrameLayout? = null

  fun registerOnActivity(activity: Activity) {
    // Attach to the decor view, not android.R.id.content: expo-updates defers
    // loadApp past onCreate, and its later setContentView() clears the content
    // frame — which would silently remove this overlay before the first draw.
    val decor = activity.window.decorView as ViewGroup

    val frame = FrameLayout(activity).apply {
      setBackgroundColor(Color.parseColor("#aed8ff"))
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    }

    val logoResId = activity.resources.getIdentifier(
      "splashscreen_logo", "drawable", activity.packageName
    )
    if (logoResId != 0) {
      val logo = ImageView(activity).apply {
        setImageResource(logoResId)
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        layoutParams = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.WRAP_CONTENT,
          FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = android.view.Gravity.CENTER }
      }
      frame.addView(logo)
    }

    decor.addView(frame)
    overlay = frame
  }

  fun hide() {
    val view = overlay ?: return
    overlay = null
    view.post {
      val fadeOut = AlphaAnimation(1f, 0f).apply { duration = 400; fillAfter = true }
      view.startAnimation(fadeOut)
      view.postDelayed({
        (view.parent as? ViewGroup)?.removeView(view)
      }, 400)
    }
  }
}
