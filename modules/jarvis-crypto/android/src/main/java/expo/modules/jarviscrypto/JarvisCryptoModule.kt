package expo.modules.jarviscrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import org.signal.argon2.Argon2
import org.signal.argon2.MemoryCost
import org.signal.argon2.Type
import org.signal.argon2.Version
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class JarvisCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JarvisCrypto")

    AsyncFunction("argon2id") { password: String, saltB64: String, params: Map<String, Int>, promise: Promise ->
      try {
        val salt = base64UrlDecode(saltB64)
        val m = params["m"] ?: throw IllegalArgumentException("Missing param 'm'")
        val t = params["t"] ?: throw IllegalArgumentException("Missing param 't'")
        val p = params["p"] ?: throw IllegalArgumentException("Missing param 'p'")

        val result = Argon2.Builder(Version.V13)
          .type(Type.Argon2id)
          .memoryCost(MemoryCost.KiB(m))
          .parallelism(p)
          .iterations(t)
          .hashLength(32)
          .build()
          .hash(password.toByteArray(Charsets.UTF_8), salt)

        promise.resolve(base64UrlEncode(result.hash))
      } catch (e: Exception) {
        promise.reject("ARGON2_ERROR", e.message, e)
      }
    }

    AsyncFunction("aesGcmEncrypt") { keyB64: String, ivB64: String, plaintextB64: String, aad: String, promise: Promise ->
      try {
        val key = base64UrlDecode(keyB64)
        val iv = base64UrlDecode(ivB64)
        val plaintext = base64UrlDecode(plaintextB64)
        val aadBytes = aad.toByteArray(Charsets.UTF_8)

        if (key.size != 32) {
          throw IllegalArgumentException("Key must be 32 bytes")
        }
        if (iv.size != 12) {
          throw IllegalArgumentException("IV must be 12 bytes")
        }

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val keySpec = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(128, iv)

        cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)
        cipher.updateAAD(aadBytes)

        val ciphertextWithTag = cipher.doFinal(plaintext)

        // GCM appends the tag to the ciphertext
        val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextWithTag.size - 16)
        val tag = ciphertextWithTag.copyOfRange(ciphertextWithTag.size - 16, ciphertextWithTag.size)

        val result = mapOf(
          "ciphertext" to base64UrlEncode(ciphertext),
          "tag" to base64UrlEncode(tag)
        )
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("ENCRYPT_ERROR", e.message, e)
      }
    }

    AsyncFunction("aesGcmDecrypt") { keyB64: String, ivB64: String, ciphertextB64: String, tagB64: String, aad: String, promise: Promise ->
      try {
        val key = base64UrlDecode(keyB64)
        val iv = base64UrlDecode(ivB64)
        val ciphertext = base64UrlDecode(ciphertextB64)
        val tag = base64UrlDecode(tagB64)
        val aadBytes = aad.toByteArray(Charsets.UTF_8)

        if (key.size != 32) {
          throw IllegalArgumentException("Key must be 32 bytes")
        }
        if (iv.size != 12) {
          throw IllegalArgumentException("IV must be 12 bytes")
        }
        if (tag.size != 16) {
          throw IllegalArgumentException("Tag must be 16 bytes")
        }

        // Reconstruct ciphertext + tag for GCM
        val ciphertextWithTag = ciphertext + tag

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val keySpec = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(128, iv)

        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)
        cipher.updateAAD(aadBytes)

        val plaintext = cipher.doFinal(ciphertextWithTag)
        promise.resolve(base64UrlEncode(plaintext))
      } catch (e: javax.crypto.AEADBadTagException) {
        promise.reject("DECRYPT_ERROR", "Authentication failed", e)
      } catch (e: Exception) {
        promise.reject("DECRYPT_ERROR", e.message, e)
      }
    }

    AsyncFunction("randomBytes") { length: Int, promise: Promise ->
      try {
        val bytes = ByteArray(length)
        SecureRandom().nextBytes(bytes)
        promise.resolve(base64UrlEncode(bytes))
      } catch (e: Exception) {
        promise.reject("RANDOM_ERROR", e.message, e)
      }
    }
  }

  private fun base64UrlEncode(data: ByteArray): String {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(data)
  }

  private fun base64UrlDecode(data: String): ByteArray {
    // Handle both padded and unpadded base64url
    var padded = data
    when (data.length % 4) {
      2 -> padded += "=="
      3 -> padded += "="
    }
    return Base64.getUrlDecoder().decode(padded)
  }
}
