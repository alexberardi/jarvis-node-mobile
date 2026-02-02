/*
 * Argon2 reference implementation - minimal header for argon2id
 * Public domain (CC0) - https://github.com/P-H-C/phc-winner-argon2
 */

#ifndef ARGON2_H
#define ARGON2_H

#include <stdint.h>
#include <stddef.h>

#define ARGON2_VERSION_NUMBER 0x13

typedef enum Argon2_type {
    Argon2_d = 0,
    Argon2_i = 1,
    Argon2_id = 2
} argon2_type;

/*
 * Argon2id hash function - raw output (no encoding)
 *
 * @param t_cost      Number of iterations
 * @param m_cost      Memory usage in KiB
 * @param parallelism Number of threads/lanes
 * @param pwd         Password bytes
 * @param pwdlen      Password length
 * @param salt        Salt bytes
 * @param saltlen     Salt length
 * @param hash        Output buffer
 * @param hashlen     Desired hash length
 * @return 0 on success, error code otherwise
 */
int argon2id_hash_raw(
    const uint32_t t_cost,
    const uint32_t m_cost,
    const uint32_t parallelism,
    const void *pwd, const size_t pwdlen,
    const void *salt, const size_t saltlen,
    void *hash, const size_t hashlen
);

/* Error codes */
#define ARGON2_OK 0
#define ARGON2_OUTPUT_PTR_NULL -1
#define ARGON2_OUTPUT_TOO_SHORT -2
#define ARGON2_OUTPUT_TOO_LONG -3
#define ARGON2_PWD_TOO_LONG -4
#define ARGON2_SALT_TOO_SHORT -5
#define ARGON2_SALT_TOO_LONG -6
#define ARGON2_TIME_TOO_SMALL -7
#define ARGON2_TIME_TOO_LARGE -8
#define ARGON2_MEMORY_TOO_LITTLE -9
#define ARGON2_MEMORY_TOO_MUCH -10
#define ARGON2_LANES_TOO_FEW -11
#define ARGON2_LANES_TOO_MANY -12
#define ARGON2_MEMORY_ALLOCATION_ERROR -22

#endif /* ARGON2_H */
