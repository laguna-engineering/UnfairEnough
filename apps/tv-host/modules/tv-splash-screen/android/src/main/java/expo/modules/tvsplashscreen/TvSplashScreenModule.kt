package expo.modules.tvsplashscreen

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TvSplashScreenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TvSplashScreen")

    AsyncFunction("preventAutoHideAsync") {
      // The overlay is already shown by registerOnActivity — nothing to do.
    }

    AsyncFunction("hideAsync") {
      TvSplashScreenManager.hide()
    }
  }
}
