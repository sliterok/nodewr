/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('factions', {
    id: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    admin: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    users: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    color: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'factions'
  });
};
