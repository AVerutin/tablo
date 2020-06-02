<template>
    <div >
        <form class="login" @submit.prevent="login">
            <label v-if="!auth"  for="pass_input">Пароль для редактирования  </label>
            <input id="pass_input" v-if="!auth" required v-model="pass" type="password" placeholder="Пароль"/><br/>
            <button class="btn" type="submit">{{ auth ? "Выход" : "Вход" }}</button>
        </form>
    </div>
</template>

<script>
    export default {
        name: "Вход",
        data(){
            return {
                auth : false,
                pass : ""
            }
        },
        methods: {
            login: function () {
                let pass = this.pass;
                this.$store.dispatch('login', {login, pass})
                    .then(() => this.$router.push('/'))
                    .catch(err => console.log(err))
            }
        }
        }
</script>

<style scoped>

</style>